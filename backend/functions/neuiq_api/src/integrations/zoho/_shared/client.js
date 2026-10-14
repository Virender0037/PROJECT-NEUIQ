/**
 * The authenticated Zoho HTTP client, shared by every Zoho product.
 *
 * One place where a request acquires a token, reaches the right data centre, survives a transient
 * failure, and turns a Zoho error into one of ours. Product clients build on this and never call
 * `fetch` themselves — the same reasoning as the frontend having exactly one `fetch`: three things
 * must be true on every request and one function is the only way to be sure they are.
 *
 * ## The retry policy, and what it deliberately does not retry
 *
 *   401  refresh the token ONCE, retry ONCE. A second 401 is a real credential problem.
 *   429  honour Retry-After when Zoho sends one; otherwise exponential backoff.
 *   5xx  exponential backoff.
 *   403  NEVER. A refusal repeated is still a refusal — it burns quota and changes nothing.
 *   4xx  never. Our request was wrong; sending it again will not make it right.
 *
 * ## What never appears in a log
 *
 * No token, no Authorization header, no query string containing credentials. The log line carries
 * method, path, status, duration and attempt count — enough to diagnose, nothing to leak. Error
 * bodies go through `redact()` before anything is kept from them.
 */
import { apiBase } from './datacenters.js';
import { mapHttpError, mapNetworkError, isRetryable, isRefreshable, redact } from './errors.js';

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 2;
const BASE_BACKOFF_MS = 300;

/** Cap a Retry-After we honour, so a hostile or mistaken header cannot park a request forever. */
const MAX_RETRY_AFTER_MS = 10_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Create a client for one Zoho product.
 *
 * `fetchImpl` and `sleepImpl` are injectable so retry and refresh behaviour is testable without a
 * network and without real delays.
 */
export function createZohoClient({
  product,
  dc,
  tokenProvider,
  fetchImpl = globalThis.fetch,
  sleepImpl = sleep,
  logger = console,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const base = apiBase(product, dc);

  async function once(path, { params, signal, accessToken }) {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(params || {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // An upstream abort (the caller navigated away) must cancel this too.
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });

    try {
      const res = await fetchImpl(url.toString(), {
        method: 'GET',
        headers: {
          // Zoho's own scheme, not Bearer.
          authorization: `Zoho-oauthtoken ${accessToken}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      });
      return res;
    } catch (err) {
      throw mapNetworkError(err);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    /**
     * GET a path on this product, returning the parsed JSON body.
     *
     * Envelope unwrapping is the caller's job: Zoho uses different envelopes per API family, and
     * a client that guessed which one it had would pick wrong the first time either changed.
     */
    async get(path, { params, signal, requestId = null, retry = true } = {}) {
      let refreshed = false;
      let attempt = 0;
      const started = Date.now();

      for (;;) {
        const accessToken = await tokenProvider.getAccessToken({ dc });
        const res = await once(path, { params, signal, accessToken });

        if (res.ok) {
          logger.log?.(JSON.stringify({
            event: 'zoho.request', requestId, product, path,
            status: res.status, ms: Date.now() - started, attempt,
          }));
          return safeJson(res);
        }

        const body = await safeJson(res);
        const err = mapHttpError({ status: res.status, body, headers: res.headers, requestId });

        // A 401 buys exactly one token refresh and one more attempt.
        if (isRefreshable(err) && !refreshed) {
          refreshed = true;
          tokenProvider.invalidate({ dc });
          continue;
        }

        // `retry: false` is for endpoints where a 5xx is not transient. The Booked and Balance
        // report answers a malformed request with HTTP 500 (observed 2026-10-13), so retrying it
        // spends rate-limit budget on a request that cannot succeed. The 401 refresh above is
        // unaffected — that is a credential refresh, not a retry of a failure.
        if (retry && isRetryable(err) && attempt < MAX_RETRIES) {
          const wait = err.retryAfterSeconds != null
            ? Math.min(err.retryAfterSeconds * 1000, MAX_RETRY_AFTER_MS)
            : BASE_BACKOFF_MS * 2 ** attempt;
          attempt += 1;
          logger.warn?.(JSON.stringify({
            event: 'zoho.retry', requestId, product, path,
            status: res.status, attempt, waitMs: wait,
          }));
          await sleepImpl(wait);
          continue;
        }

        // Terminal. The body is redacted before any part of it is kept — an OAuth error body can
        // carry the very token that failed.
        logger.warn?.(JSON.stringify({
          event: 'zoho.error', requestId, product, path,
          status: res.status, mapped: err.name, body: redact(body),
        }));
        throw err;
      }
    },
  };
}

/**
 * Read a response body as JSON without losing large integers.
 *
 * Reads the raw text and parses it with `parseZohoJson`, never `res.json()` — by the time
 * `res.json()` returns, an 18-digit id has already been rounded. An object with no `text()` (a
 * test double that only implements `json()`) falls back to `json()`; a real fetch Response always
 * has `text()`.
 *
 * Malformed JSON is still `null`, as before: the envelope unwrappers turn a null body into a
 * shape error rather than an empty result.
 */
async function safeJson(res) {
  if (typeof res?.text !== 'function') {
    try { return await res.json(); } catch { return null; }
  }
  let text;
  try { text = await res.text(); } catch { return null; }
  try {
    return parseZohoJson(text);
  } catch (err) {
    // An unsafe integer on a runtime that cannot recover it is not "malformed" — it is a body we
    // would otherwise corrupt. That must surface, not read as an empty response.
    if (err.precision) throw err;
    return null;
  }
}

/**
 * True when `JSON.parse` hands a reviver the source text of each primitive (Node 21+ / V8 11.4+).
 * Detected once, by behaviour rather than version.
 */
export const SOURCE_TEXT_SUPPORTED = (() => {
  let seen = false;
  try {
    JSON.parse('1', (_k, v, ctx) => { seen = ctx?.source === '1'; return v; });
  } catch { /* unsupported */ }
  return seen;
})();

const INTEGER_LITERAL = /^-?\d+$/;

/**
 * JSON.parse, keeping integers outside the safe range as their exact source string.
 *
 * ## Why this exists
 *
 * Zoho People sends its 18-digit identifiers — `Zoho_ID`, leave `employee.zoho_id`, `leave_id`,
 * `leave_type.id` — as JSON **numbers**. JavaScript holds integers exactly only up to 2^53 − 1
 * (16 digits), so `JSON.parse` silently rounds them: a live leave row's employee id came back 27
 * away from the real one. Nothing throws, and two different employees' ids can round to the same
 * value. The employee form's `__recordId` arrives as an object KEY, which is always a string, so
 * the same id compared exactly against itself looked like two different ids.
 *
 * ## What it changes
 *
 * Only a value that is a number, is not a safe integer, AND whose source text is a plain integer
 * literal becomes a string — the exact digits Zoho sent. Safe integers, decimals, exponent forms,
 * negatives within range, booleans, null, strings, arrays and objects are returned exactly as
 * `JSON.parse` would. A large DECIMAL is left as a number: it is not an identifier, and its source
 * text is not an integer.
 *
 * ## Where the runtime cannot do this
 *
 * Without source-text access the exact digits are unrecoverable, so an unsafe integer THROWS
 * (`err.precision === true`, status 502) instead of being returned rounded. A silently wrong id
 * would fail every ownership check, or worse, match the wrong person.
 */
export function parseZohoJson(text) {
  return JSON.parse(text, (_key, value, ctx) => {
    if (typeof value !== 'number' || Number.isSafeInteger(value) || !Number.isInteger(value)) return value;
    const source = ctx?.source;
    if (typeof source === 'string') return INTEGER_LITERAL.test(source) ? source : value;
    if (!SOURCE_TEXT_SUPPORTED) {
      throw Object.assign(
        new Error('zoho: response holds an integer too large to read exactly on this Node version (needs JSON.parse source text access, Node 21+).'),
        { status: 502, precision: true },
      );
    }
    return value;
  });
}
