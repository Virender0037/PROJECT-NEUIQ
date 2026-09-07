/**
 * Zoho failures, mapped to errors the rest of the backend already understands.
 *
 * Two rules drive every decision in this file, and both come from the product rather than from
 * error handling as a discipline.
 *
 * **A 403 stays a 403.** "You may not see this" is a real, correct answer about someone's
 * permissions. Widening it into a generic 503, or an empty result, or seed data, misrepresents
 * a person's access — and an empty result is indistinguishable from "no records", so the caller
 * is told they have no leave when the truth is that they may not look.
 *
 * **Nothing here offers a fallback.** There is no flag on any of these errors that means "use the
 * seed instead". A Zoho outage is a 503. The seed is selected at boot by configuration and is
 * unreachable at request time by construction — see people/dataSource.js. An error type that
 * could switch data sources would put that decision back inside a catch block, which is where it
 * gets made wrongly.
 */

/** Base for everything Zoho hands back. `status` is what the HTTP layer will use. */
export class ZohoError extends Error {
  constructor(message, { status = 502, code = null, retryable = false, requestId = null } = {}) {
    super(message);
    this.name = 'ZohoError';
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}

/** 401 — token missing, expired or rejected. One refresh and one retry, then give up. */
export class ZohoAuthError extends ZohoError {
  constructor(message = 'Zoho rejected the credentials.', opts = {}) {
    super(message, { status: 401, retryable: false, ...opts });
    this.name = 'ZohoAuthError';
    /** The caller may refresh once and retry — distinct from `retryable`, which means "retry as-is". */
    this.refreshable = true;
  }
}

/** 403 — authenticated, but not permitted. Never retried, never softened, never substituted. */
export class ZohoForbiddenError extends ZohoError {
  constructor(message = 'Not available on this account.', opts = {}) {
    super(message, { status: 403, retryable: false, ...opts });
    this.name = 'ZohoForbiddenError';
  }
}

/** 429 — over quota. Honour Retry-After rather than guessing a backoff. */
export class ZohoRateLimitError extends ZohoError {
  constructor(message = 'Zoho rate limit reached.', { retryAfterSeconds = null, ...opts } = {}) {
    super(message, { status: 429, retryable: true, ...opts });
    this.name = 'ZohoRateLimitError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** 5xx, timeout, DNS, connection refused — Zoho is unreachable or broken. Surfaces as 503. */
export class ZohoUpstreamError extends ZohoError {
  constructor(message = 'Zoho People is unavailable right now.', opts = {}) {
    super(message, { status: 503, retryable: true, ...opts });
    this.name = 'ZohoUpstreamError';
  }
}

/** The call succeeded but the body was not the shape we know. A bug to fix, not a blip to retry. */
export class ZohoTransformError extends ZohoError {
  constructor(message = 'Zoho returned an unexpected response shape.', opts = {}) {
    super(message, { status: 502, retryable: false, ...opts });
    this.name = 'ZohoTransformError';
  }
}

/** Keys whose values must never reach a log line, an error message or a response body. */
const SECRET_KEYS = [
  'authorization', 'access_token', 'refresh_token', 'client_secret', 'client_id',
  'code', 'token', 'password', 'x-zoho-oauthtoken',
];

/**
 * Redact secrets from anything about to be logged.
 *
 * Zoho echoes request parameters in some error bodies, and an OAuth error body can contain the
 * very token that failed. Attaching a raw body to an error is how a refresh token ends up in a
 * log aggregator, so bodies go through here first. Recurses, and leaves non-secret values alone
 * so the log is still worth reading.
 */
export function redact(value, depth = 0) {
  if (depth > 6 || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SECRET_KEYS.includes(key.toLowerCase()) ? '[redacted]' : redact(v, depth + 1);
  }
  return out;
}

/**
 * HTTP status -> our error type.
 *
 * `body` is accepted only so a message can be salvaged from it; it is redacted before anything is
 * kept, and it is never attached wholesale.
 */
export function mapHttpError({ status, body = null, headers = null, requestId = null } = {}) {
  const detail = messageFrom(body);
  const opts = { requestId, code: codeFrom(body) };

  if (status === 401) return new ZohoAuthError(detail || undefined, opts);
  if (status === 403) return new ZohoForbiddenError(detail || undefined, opts);
  if (status === 429) {
    return new ZohoRateLimitError(detail || undefined, {
      ...opts,
      retryAfterSeconds: retryAfterFrom(headers),
    });
  }
  if (status >= 500) return new ZohoUpstreamError(detail || undefined, opts);

  // 400 and other 4xx: our request was wrong. Not retryable, and not a permission problem.
  return new ZohoError(detail || `Zoho rejected the request (${status}).`, {
    status: 502,
    retryable: false,
    ...opts,
  });
}

/** Network-level failure — the request never got an HTTP status at all. */
export function mapNetworkError(err, { requestId = null } = {}) {
  const aborted = err?.name === 'AbortError';
  return new ZohoUpstreamError(
    aborted ? 'Zoho People did not respond in time.' : 'Could not reach Zoho People.',
    { requestId, code: aborted ? 'TIMEOUT' : (err?.code ?? 'NETWORK') },
  );
}

/**
 * Should this be retried as-is?
 *
 * Only rate limits and upstream failures. A 403 is never retried — repeating a request that was
 * correctly refused wastes quota and changes nothing.
 */
export const isRetryable = (err) => Boolean(err?.retryable);

/** Should the caller refresh the token and try once more? 401 only. */
export const isRefreshable = (err) => Boolean(err?.refreshable);

// ---------------------------------------------------------------- helpers

function messageFrom(body) {
  if (!body) return null;
  if (typeof body === 'string') return body.slice(0, 200) || null;
  if (typeof body !== 'object') return null;
  const raw = body.message ?? body.error_description ?? body.error ?? null;
  return typeof raw === 'string' ? raw.slice(0, 200) : null;
}

function codeFrom(body) {
  if (!body || typeof body !== 'object') return null;
  const raw = body.code ?? body.errorCode ?? body.error ?? null;
  return typeof raw === 'string' ? raw : null;
}

function retryAfterFrom(headers) {
  if (!headers) return null;
  const raw = typeof headers.get === 'function' ? headers.get('retry-after') : headers['retry-after'];
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
