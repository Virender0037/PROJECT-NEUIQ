/**
 * A per-endpoint request limiter that refuses BEFORE Zoho has to.
 *
 * Zoho People throttles per endpoint and then locks the endpoint out: the Booked and Balance
 * report allows 30 requests, then refuses everything for two minutes. A lockout is org-wide — it
 * is not "this user is slow", it is "nobody gets a leave balance for two minutes" — so the cheap
 * failure is ours, not theirs.
 *
 * Two rules:
 *
 *   window   at most `limit` requests per `windowMs`, set below Zoho's threshold for headroom.
 *   lockout  once Zoho answers 429, refuse locally for `lockoutMs` (or Zoho's Retry-After), so we
 *            do not keep knocking on a door Zoho has already shut and extend the lock.
 *
 * Both refuse with a 429 that says when to try again, and neither makes a request to find out.
 *
 * Per process, like the cache. On Catalyst several instances can each spend a full window, so the
 * limit is a ceiling per instance, not per organisation — a shared counter in Catalyst Cache is the
 * production answer. Recorded here so it is not mistaken for a global guarantee.
 */
import { ZohoRateLimitError } from './errors.js';

export function createRateLimiter({
  name,
  limit,
  windowMs,
  lockoutMs,
  now = () => Date.now(),
}) {
  if (!name || !(limit > 0) || !(windowMs > 0) || !(lockoutMs > 0)) {
    throw new Error('rateLimiter: name, limit, windowMs and lockoutMs are all required');
  }
  /** Request timestamps inside the current window. */
  let stamps = [];
  let blockedUntil = 0;

  const refuse = (waitMs, why) => {
    const seconds = Math.max(1, Math.ceil(waitMs / 1000));
    return new ZohoRateLimitError(
      `${name} is busy (${why}). Try again in about ${seconds} second${seconds === 1 ? '' : 's'}.`,
      { retryAfterSeconds: seconds, code: 'LOCAL_RATE_LIMIT' },
    );
  };

  return {
    /** Take one request slot, or throw a 429 without touching the network. */
    acquire() {
      const t = now();
      if (t < blockedUntil) throw refuse(blockedUntil - t, 'Zoho rate limit lockout');
      stamps = stamps.filter((s) => s > t - windowMs);
      if (stamps.length >= limit) throw refuse(stamps[0] + windowMs - t, 'request limit reached');
      stamps.push(t);
    },

    /** Zoho said 429: stop for its Retry-After, or our documented lockout if it gave none. */
    lockout(retryAfterSeconds = null) {
      const ms = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : lockoutMs;
      blockedUntil = Math.max(blockedUntil, now() + ms);
    },

    /** For tests and /health-style diagnostics. No request contents, counts only. */
    status() {
      const t = now();
      return { inWindow: stamps.filter((s) => s > t - windowMs).length, limit, lockedForMs: Math.max(0, blockedUntil - t) };
    },
  };
}
