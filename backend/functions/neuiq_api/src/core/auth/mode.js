/**
 * How callers authenticate — decided once at boot, never by a request.
 *
 *   demo  the seeded account picker and `POST /auth/login {username}`. No password: whoever names
 *         an account IS that account. Tolerable only over generated seed data, in development.
 *   zoho  Zoho sign-in (OIDC). Not implemented yet (Phase 5 E5), so in this mode NOBODY can sign
 *         in — the demo routes do not exist and every bearer token is refused. That is the
 *         intended fail-closed state until real sign-in lands.
 *
 * ## The rules, and why each one exists
 *
 *   unset + seed data            -> demo      today's development behaviour, unchanged
 *   unset + anything else        -> refused   nobody chose, and live data must not get a default
 *   not 'demo' or 'zoho'         -> refused   a typo must stop the process, not pick a mode
 *   demo + data that is not seed -> refused   impersonation must never reach live Zoho data
 *   demo + NODE_ENV=production   -> refused   no password-less login in production, ever
 *
 * The data source arrives as the PUBLIC value ('seed' | 'zoho' | null): anything other than an
 * explicit 'seed' — including an unrecognised source — is treated as live for these rules.
 *
 * Imports nothing, so every branch is testable without touching process.env.
 */

export const AUTH_DEMO = 'demo';
export const AUTH_ZOHO = 'zoho';
export const AUTH_MODES = Object.freeze([AUTH_DEMO, AUTH_ZOHO]);

const refuse = (message) => new Error(`authMode: refusing to start. ${message}`);

/**
 * Resolve NEUIQ_AUTH_MODE against the data source. Throws with a reason for every refused
 * combination; returns { mode, isDemo, isZoho } otherwise.
 *
 * Matching is case-insensitive and trimmed, like NEUIQ_DATA_SOURCE, so "Zoho" is zoho — but only
 * the two words: anything else is refused rather than guessed.
 */
export function resolveAuthMode(env = process.env, { dataSource = null } = {}) {
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const raw = env.NEUIQ_AUTH_MODE;
  const given = raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase();
  const seedData = dataSource === 'seed';

  let mode;
  if (!given) {
    if (!seedData) {
      throw refuse('NEUIQ_AUTH_MODE is unset and the data source is not seed. Set NEUIQ_AUTH_MODE=zoho for live data.');
    }
    mode = AUTH_DEMO;
  } else if (AUTH_MODES.includes(given)) {
    mode = given;
  } else {
    // The value is configuration, not a secret, but it is clipped so a pasted credential in the
    // wrong variable cannot be echoed whole into a log.
    throw refuse(`NEUIQ_AUTH_MODE must be one of ${AUTH_MODES.join(' | ')}, got ${JSON.stringify(String(raw).slice(0, 16))}.`);
  }

  if (mode === AUTH_DEMO && !seedData) {
    throw refuse('NEUIQ_AUTH_MODE=demo is only allowed with NEUIQ_DATA_SOURCE=seed — demo login has no password, and must never reach live Zoho data.');
  }
  if (mode === AUTH_DEMO && production) {
    throw refuse('NEUIQ_AUTH_MODE=demo is not allowed with NODE_ENV=production.');
  }

  return { mode, isDemo: mode === AUTH_DEMO, isZoho: mode === AUTH_ZOHO };
}

/** For a startup log line. Says plainly what demo mode is. */
export function describeAuthMode(resolved) {
  return resolved.isDemo
    ? 'demo — seeded accounts, no password (development only)'
    : 'zoho — Zoho sign-in (not configured yet: nobody can sign in)';
}
