/**
 * Turning a verified token into the caller the rest of the app reasons about.
 *
 * This is the file that fixes the worst dependency in the old layout: middleware/index.js imported
 * `dataset` from dashboards/query.service.js, so **authentication depended on the dashboard query
 * service, which depended on the Zoho People seed.** Authentication is the last layer that should
 * know which product supplies the records.
 *
 * Now core states the interface and an integration supplies the implementation:
 *
 *   IdentityResolver = (payload) => Principal | null
 *
 * Wired once at boot by integrations/registry.js. When a second product arrives it registers its
 * own resolver; nothing in here changes.
 */

/**
 * Set by the composition root. A missing resolver is a wiring bug, not an auth failure, so it
 * throws rather than returning null — returning null would surface as "sign in to continue" and
 * send someone debugging tokens instead of boot order.
 */
let resolver = null;

export function setIdentityResolver(fn) {
  resolver = fn;
}

/**
 * Resolve a verified token payload to the caller.
 *
 * The record is looked up FRESH on every request rather than trusted from the token, so a role
 * change takes effect immediately instead of on next sign-in — and so a token cannot assert a
 * role its employee does not have. That property moved here intact and must stay.
 */
export function resolvePrincipal(payload) {
  if (!resolver) throw new Error('auth: no identity resolver registered — check integrations/registry.js');
  return resolver(payload);
}
