/**
 * The deployment this PROCESS serves — bound once, from the validated environment profile.
 *
 * E2.2. The environment profile (environment.js) decides the deployment namespace — e.g.
 * `dev/seed` or `test/zoho-com/acme-test`. createApp() binds it here, and everything that must not
 * cross a deployment boundary reads it here AT REQUEST TIME: cache keys, the shared employee
 * snapshot, the dashboard store, and (E4/E5) sessions.
 *
 * Two rules:
 *
 *   unbound   every caller of `currentNamespace()` is REFUSED (503, DEPLOYMENT_UNBOUND). A live
 *             component that somehow runs before the profile was accepted reads nothing.
 *   rebinding to the SAME namespace is a no-op (several apps in one test process); to a DIFFERENT
 *             one it throws. One process never serves two deployments, so nothing held in memory
 *             — a token, a snapshot, a cache entry — can ever be served across them.
 *
 * The namespace is a PARTITION, not a verification: it says which deployment the operator
 * configured, not which Zoho organisation the credentials really belong to (that is unresolved —
 * see environment.js).
 */
let bound = null;

export class DeploymentUnboundError extends Error {
  constructor() {
    super('The service is not bound to a deployment yet.');
    this.name = 'DeploymentUnboundError';
    this.code = 'DEPLOYMENT_UNBOUND';
    this.status = 503;
  }
}

/** Bind the process to a validated profile's namespace. Throws on an attempt to switch. */
export function bindDeployment(profile) {
  const ns = profile?.namespace;
  if (typeof ns !== 'string' || !ns) throw new Error('deployment: a validated profile with a namespace is required');
  if (bound && bound.namespace !== ns) {
    throw new Error('deployment: this process is already bound to another deployment namespace — one process serves one deployment.');
  }
  if (!bound) bound = Object.freeze({ namespace: ns, environment: profile.environment });
  return bound;
}

/** The bound namespace, or a refusal. Read at request time, never cached by the caller. */
export function currentNamespace() {
  if (!bound) throw new DeploymentUnboundError();
  return bound.namespace;
}

/** For diagnostics and tests. */
export const boundDeployment = () => bound;
