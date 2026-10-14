/**
 * Where People records come from — decided once, at boot, by configuration.
 *
 * ## The rule this file exists to enforce
 *
 * **The data source is chosen at boot, never at request time.** There is no code path anywhere
 * that reacts to a Zoho failure by reading the seed instead. A Zoho outage is a 503; a 403 stays
 * a 403; an empty result stays empty. Substituting invented HR figures for any of those is worse
 * than an error message, because the figures look right.
 *
 * That guarantee is structural rather than disciplined: this module resolves one value at
 * startup, and nothing exposes a way to change it afterwards. A request handler cannot fall back
 * because it has nothing to fall back to.
 *
 * ## Production refuses to start on seed
 *
 * If NODE_ENV is production and the seed is selected, `assertBootable()` throws and the process
 * should exit non-zero. Not a warning — a warning scrolls past, and the failure it precedes is a
 * server confidently serving fabricated leave balances to real employees.
 *
 * ## Why the seed still exists
 *
 * It is deterministic, it needs no network or credentials, and it is what lets the 65 backend
 * assertions run in CI. The danger was never the seed; it was the seed being reachable when
 * something else failed.
 */

export const SEED = 'seed';
export const ZOHO = 'zoho';

const VALID = [SEED, ZOHO];

/**
 * Resolve the configured source from an environment.
 *
 * Pure, and takes the environment as an argument, so every branch is testable without touching
 * `process.env` or pretending to be in production.
 */
export function resolveDataSource(env = process.env) {
  const nodeEnv = String(env.NODE_ENV || 'development').toLowerCase();
  const production = nodeEnv === 'production';

  const raw = env.NEUIQ_DATA_SOURCE;
  // Defaulting to the seed is right in development and is exactly what production must refuse:
  // an unset variable in production means nobody decided, and nobody deciding must not resolve
  // to fabricated data.
  const source = String(raw || SEED).trim().toLowerCase();

  if (!VALID.includes(source)) {
    throw new Error(
      `dataSource: NEUIQ_DATA_SOURCE must be one of ${VALID.join(' | ')}, got ${JSON.stringify(raw)}`,
    );
  }

  if (production && source === SEED) {
    throw new Error(
      'dataSource: refusing to start. NODE_ENV=production with NEUIQ_DATA_SOURCE=' +
      `${source} would serve generated demo records as real HR data. ` +
      'Set NEUIQ_DATA_SOURCE=zoho, or do not run this build in production.',
    );
  }

  return { source, production, isSeed: source === SEED, isZoho: source === ZOHO };
}

/**
 * The boot gate. Call once from the entry point, before the server listens.
 *
 * Returns the resolved descriptor so the caller can log which source is live — that line is the
 * operator's confirmation of what they are looking at, and it is the reason a seeded backend is
 * never mistaken for a live one.
 */
export function assertBootable(env = process.env) {
  return resolveDataSource(env);
}

/**
 * A one-line description for logs and for /health.
 *
 * Says "generated demo data" rather than anything softer. Whoever reads this line is deciding
 * whether to trust the numbers on their screen.
 */
export function describeDataSource(resolved) {
  return resolved.isSeed
    ? 'seed — generated demo data, not Zoho People'
    : 'zoho — live Zoho People';
}

/**
 * The data source as clients may see it: exactly `'seed'`, `'zoho'`, or null.
 *
 * What /health and /me report, so the UI can say "demo data" instead of assuming that a reachable
 * backend means live Zoho data. Deliberately a single word chosen from a closed set: nothing from
 * the environment passes through, so there is no way for a DC, a client id or any other config
 * value to reach a response body. Anything it does not recognise is null — "unknown" — never a
 * guess, and never "zoho".
 */
export function publicDataSource(resolved) {
  if (resolved?.isZoho === true && resolved?.source === ZOHO) return ZOHO;
  if (resolved?.isSeed === true && resolved?.source === SEED) return SEED;
  return null;
}
