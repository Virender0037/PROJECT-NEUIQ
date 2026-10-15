/**
 * The Zoho OAuth token provider — shared by every Zoho product.
 *
 * Structure and lifecycle only. Nothing here is wired into a request path yet, and no credential
 * appears in this file: everything comes from configuration, and an unconfigured provider reports
 * that rather than pretending.
 *
 * ## What it guarantees
 *
 * **Nothing secret is ever logged.** No token, no client secret, no Authorization header. The
 * provider takes an optional logger and only ever hands it metadata — which DC, whether a refresh
 * happened, how long the new token is good for. `toString`/`toJSON` on the provider are
 * overridden so that an accidental interpolation or `JSON.stringify` cannot spill config either.
 *
 * **One refresh at a time.** Ten concurrent widget resolves must not fire ten refresh calls: Zoho
 * rate-limits the token endpoint hard, and losing the refresh is worse than any single request
 * failing. A refresh in flight is shared by everyone waiting.
 *
 * **The cache is keyed by data centre.** A token minted on `.in` is invalid against `.com`, so a
 * DC change must never be served a cached token from the previous one.
 *
 * **Expiry has a skew.** A token that expires in ten seconds is treated as expired. Handing out a
 * token that dies mid-flight produces a 401 that looks like a permissions bug.
 *
 * ## The OAuth model — decided 2026-09-07
 *
 * **Service account for the POC.** One refresh token, one Zoho identity, reading on every
 * caller's behalf. This was an open question until `data_select=ALL` returned 200 on the leave
 * endpoint: `MINE` is relative to whoever the token belongs to, so under a single identity it
 * would have returned the service account's own leave rather than the caller's, and per-user
 * OAuth would have been mandatory rather than optional.
 *
 * The refresh-token grant below is exactly what that model needs, and it is complete.
 *
 * **What the decision costs.** Zoho applies no narrowing under `ALL`, so our read-time scoping in
 * core/policy/scope.js is the only thing between an employee and the whole organisation's leave.
 * See the warning on `dataSelectFor` in people/endpoints.js — the post-query row assertion stops
 * being optional the moment this is wired to live data.
 *
 * ## Per-user OAuth — production hardening, not built
 *
 * Each user consents once and the app holds their token, so Zoho enforces authorisation natively
 * and ours becomes defence in depth rather than the sole control. That is the right end state for
 * anything handling real HR data, and it is deliberately deferred rather than dismissed.
 *
 * It needs, none of which exists: an authorization-code flow with a redirect endpoint, encrypted
 * per-user refresh-token storage, a re-consent path for expiry or revocation, and a decision
 * about what happens to a saved dashboard when its owner's grant lapses. The provider below is
 * already shaped for it — `getAccessToken({ dc })` becomes `getAccessToken({ dc, connection })`
 * and the cache key widens — so adopting it is an extension, not a rewrite.
 */
import { accountsBase, expectedApiDomain } from './datacenters.js';
import { mapHttpError, mapNetworkError, ZohoAuthError, ZohoError, redact } from './errors.js';

/** Treat a token as expired this many ms early, so it cannot die in flight. */
const EXPIRY_SKEW_MS = 120_000;

/** Give up on the token endpoint after this long. */
const TOKEN_TIMEOUT_MS = 10_000;

/**
 * Read provider configuration from the environment.
 *
 * Returns what is present without throwing, so a caller can ask "is this configured?" and get an
 * answer instead of an exception. Values are never logged, and this object should not be either —
 * pass `describeConfig()` to a log line instead.
 *
 * `dc` is null when ZOHO_DC is unset — never a default. Live Zoho refuses to start without it
 * (`resolveZohoDc` in datacenters.js); a token request with no DC throws in `accountsBase`.
 */
export function configFromEnv(env = process.env) {
  const dc = env.ZOHO_DC === undefined || env.ZOHO_DC === null ? '' : String(env.ZOHO_DC).trim().toLowerCase();
  return {
    dc: dc || null,
    clientId: env.ZOHO_CLIENT_ID || null,
    clientSecret: env.ZOHO_CLIENT_SECRET || null,
    refreshToken: env.ZOHO_REFRESH_TOKEN || null,
  };
}

/** True when a refresh-token grant could actually be attempted. */
export const isConfigured = (config) =>
  Boolean(config?.clientId && config?.clientSecret && config?.refreshToken);

/**
 * A safe summary for logs and /health.
 *
 * Reports presence, never values. "clientSecret: set" is the most anyone operating this needs to
 * know, and it is the most that can be said without creating a way to leak it.
 */
export function describeConfig(config) {
  return {
    dc: config?.dc ?? null,
    clientId: config?.clientId ? 'set' : 'missing',
    clientSecret: config?.clientSecret ? 'set' : 'missing',
    refreshToken: config?.refreshToken ? 'set' : 'missing',
    configured: isConfigured(config),
  };
}

/**
 * Create a token provider.
 *
 * `fetchImpl` and `now` are injectable so the refresh lifecycle — caching, skew, single-flight,
 * error mapping — is testable without a network and without waiting on a clock.
 */
export function createTokenProvider({
  config = configFromEnv(),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  logger = null,
} = {}) {
  /** { [dc]: { accessToken, expiresAt } } — access tokens are held in memory only. */
  const cache = new Map();

  /** { [dc]: Promise } — the in-flight refresh, so concurrent callers share one call. */
  const inFlight = new Map();

  const log = (event, detail) => {
    // Only ever metadata. `detail` is redacted regardless, because the cost of being wrong here
    // is a refresh token in a log aggregator.
    if (logger?.info) logger.info({ event, ...redact(detail || {}) });
  };

  async function requestToken(dc) {
    const url = `${accountsBase(dc)}/oauth/v2/token`;

    // Credentials go in the body, never the query string: a URL is logged by proxies and servers
    // as a matter of course, and a client secret in an access log is a secret that has leaked.
    const body = new URLSearchParams({
      refresh_token: config.refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TOKEN_TIMEOUT_MS);

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      throw mapNetworkError(err);
    } finally {
      clearTimeout(timer);
    }

    const payload = await safeJson(res);

    if (!res.ok) throw mapHttpError({ status: res.status, body: payload, headers: res.headers });

    // Zoho can answer 200 with an error body on this endpoint, so status alone is not the signal.
    if (payload?.error || !payload?.access_token) {
      throw new ZohoAuthError(
        typeof payload?.error === 'string' ? payload.error : 'Zoho did not return an access token.',
      );
    }

    // The token must belong to the configured data centre (E2.2). Zoho names the API domain a
    // token is for; anything but the exact allow-listed domain for ZOHO_DC — or no domain at all —
    // is refused here, BEFORE the token is cached or sent anywhere. The received value is not
    // logged or echoed: it is untrusted input.
    const expected = expectedApiDomain(dc);
    if (payload.api_domain !== expected) {
      const code = payload.api_domain ? 'API_DOMAIN_MISMATCH' : 'API_DOMAIN_MISSING';
      log('zoho.token.refused', { dc, code });
      throw new ZohoError(
        `The Zoho token is not for the configured data centre (ZOHO_DC=${dc}). Check that ZOHO_DC matches where the OAuth client was created.`,
        { status: 503, code },
      );
    }

    const ttlMs = Number(payload.expires_in || 3600) * 1000;
    return { accessToken: payload.access_token, expiresAt: now() + ttlMs - EXPIRY_SKEW_MS };
  }

  async function refresh(dc) {
    // Share an in-flight refresh rather than starting a second one.
    const existing = inFlight.get(dc);
    if (existing) return existing;

    const promise = (async () => {
      const entry = await requestToken(dc);
      cache.set(dc, entry);
      log('zoho.token.refreshed', { dc, expiresInMs: entry.expiresAt - now() });
      return entry.accessToken;
    })().finally(() => inFlight.delete(dc));

    inFlight.set(dc, promise);
    return promise;
  }

  const provider = {
    /**
     * A valid access token for this DC, refreshing if the cached one is missing or near expiry.
     */
    async getAccessToken({ dc = config.dc } = {}) {
      if (!isConfigured(config)) {
        throw new ZohoAuthError(
          'Zoho OAuth is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ' +
          'ZOHO_REFRESH_TOKEN — see backend/.env.example.',
        );
      }
      const cached = cache.get(dc);
      if (cached && cached.expiresAt > now()) return cached.accessToken;
      return refresh(dc);
    },

    /**
     * Drop the cached token for a DC. Called after a 401, before the single permitted retry.
     */
    invalidate({ dc = config.dc } = {}) {
      cache.delete(dc);
      log('zoho.token.invalidated', { dc });
    },

    /** Presence-only status, safe to expose on /health. */
    status: () => describeConfig(config),

    /** For tests and diagnostics: is a live token held for this DC right now? */
    hasCachedToken: ({ dc = config.dc } = {}) => {
      const entry = cache.get(dc);
      return Boolean(entry && entry.expiresAt > now());
    },
  };

  // Belt and braces: a provider that lands in a template string or JSON.stringify must not print
  // config. Both are easy accidents in a log line.
  provider.toString = () => '[ZohoTokenProvider]';
  provider.toJSON = () => describeConfig(config);

  return provider;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
