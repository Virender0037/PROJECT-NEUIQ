/**
 * Authorization decisions that need to know about people, not just roles.
 *
 * `resolveSubject` was in services/zoho-people/tools/index.js, where it read the People dataset
 * directly. The DECISION it makes — you may read yourself, a manager may read a direct report, an
 * admin may read anyone — is not a People concept, so it belongs here. The DATA it needs is, so
 * the directory is injected rather than imported.
 *
 * That inversion is the point of the split: core states the rule, an integration supplies the
 * records, and the composition root wires them together. Core never imports a product.
 */
import { isAdmin } from './roles.js';

/**
 * The employee directory this policy consults. Set once at boot by integrations/registry.js.
 *
 * Injected rather than imported so this module has no product dependency. A missing directory is
 * a wiring bug and throws loudly — defaulting to "deny everything" would look like a permissions
 * problem and send someone hunting in the wrong place.
 */
let directory = null;

export function setDirectory(impl) {
  directory = impl;
}

/**
 * Resolve which employee a request is about, and refuse if the caller may not ask.
 *
 * Moved verbatim from the People tools module. The manager check is the one that stops
 * "show me Priya's leave balance" working for someone who is not her manager.
 */
export function resolveSubject(user, employeeId) {
  if (!employeeId || employeeId === 'me' || employeeId === user.employeeId) return user.employeeId;

  if (isAdmin(user)) return employeeId;

  if (!directory) throw new Error('policy: no directory registered — check integrations/registry.js');

  // A manager may ask about their own reports and nobody else's.
  const subject = directory.byId(employeeId);
  if (subject && subject.managerId === user.employeeId) return employeeId;

  const err = new Error('You can only see your own records, or your direct reports.');
  err.status = 403;
  throw err;
}
