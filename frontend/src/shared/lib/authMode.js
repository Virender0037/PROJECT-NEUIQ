/**
 * What the sign-in screen may offer — decided by what the backend REPORTS as its auth mode.
 *
 *   demo     the seeded account picker and username sign-in (no password; development only)
 *   zoho     "Continue with Zoho", shown but DISABLED and marked "Not configured yet" until
 *            Zoho sign-in exists. Nothing else: no picker, no username form.
 *   pending  /health has not answered yet — offer nothing, claim nothing
 *   unavailable  the server is unreachable, or reported no recognisable mode — offer nothing
 *
 * Demo sign-in is offered ONLY on an explicit 'demo' from the backend. A missing, misspelt or
 * unknown mode fails closed. The backend enforces the same rule on its own (core/auth/mode.js):
 * in zoho mode the demo routes do not exist and no token is accepted, so this screen is a
 * courtesy, never the control.
 *
 * Imports nothing, so it can be asserted under plain `node`.
 */

export const AUTH_MODE = Object.freeze({ DEMO: 'demo', ZOHO: 'zoho' });

/** Zoho sign-in (OIDC, Phase 5 E5) is not built. Flip only when it is. */
export const ZOHO_SIGN_IN_AVAILABLE = false;

/** 'demo' | 'zoho' | null; undefined while not yet heard. Exact lower-case words only. */
export function normaliseAuthMode(value) {
  if (value === undefined) return undefined;
  return value === AUTH_MODE.DEMO || value === AUTH_MODE.ZOHO ? value : null;
}

export const SIGN_IN_COPY = Object.freeze({
  zohoNotConfigured: 'Sign-in with Zoho is not configured yet, so nobody can sign in here yet.',
  pending: 'Checking how to sign in…',
  unknown: 'Sign-in unavailable — the server did not report a sign-in method.',
  offline: 'Sign-in unavailable — cannot connect to server',
  demoOnly: 'Demo sign-in is not available on this server.',
});

/**
 * The sign-in choices for a reported mode.
 *
 * `allowDemo` gates EVERYTHING demo — the account picker and the username form. `zoho` is always
 * described (so the control is visible in zoho mode) but `enabled` stays false until Zoho
 * sign-in exists: a button that looks like it signs you in and does not is a lie.
 */
export function loginOptions({ authMode, offline = false } = {}) {
  const mode = normaliseAuthMode(authMode);
  const zoho = { label: 'Continue with Zoho', enabled: ZOHO_SIGN_IN_AVAILABLE, note: ZOHO_SIGN_IN_AVAILABLE ? null : 'Not configured yet' };

  if (mode === AUTH_MODE.DEMO && !offline) {
    return { kind: 'demo', allowDemo: true, showZoho: true, zoho, message: null };
  }
  if (mode === AUTH_MODE.ZOHO && !offline) {
    return { kind: 'zoho', allowDemo: false, showZoho: true, zoho, message: ZOHO_SIGN_IN_AVAILABLE ? null : SIGN_IN_COPY.zohoNotConfigured };
  }
  if (offline) return { kind: 'unavailable', allowDemo: false, showZoho: false, zoho, message: SIGN_IN_COPY.offline };
  if (mode === undefined) return { kind: 'pending', allowDemo: false, showZoho: false, zoho, message: SIGN_IN_COPY.pending };
  return { kind: 'unavailable', allowDemo: false, showZoho: false, zoho, message: SIGN_IN_COPY.unknown };
}
