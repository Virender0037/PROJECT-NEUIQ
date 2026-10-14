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
 * "Every employee". Returned only for an HR admin, and compared by identity, so nothing a tool or
 * a model produces can be mistaken for it — a Set someone built, or the string "*", is still a Set
 * or a string.
 */
export const ANY_EMPLOYEE = Object.freeze({ toString: () => '[any employee]' });

const forbidden = (message) => Object.assign(new Error(message), { status: 403 });

const requireDirectory = () => {
  if (!directory) throw new Error('policy: no directory registered — check integrations/registry.js');
  return directory;
};

/**
 * The caller's direct reports, or null when the reporting line cannot be known.
 *
 * Null is not "no reports". Live mode switches the hierarchy off because no reporting field has
 * been confirmed (people/manifest.js), and a directory that cannot answer must not be read as one
 * that answered "nobody" — that is how a refusal turns into a confident empty list.
 */
function reportsOf(user) {
  const dir = requireDirectory();
  if (dir.hierarchyAvailable === false || typeof dir.reportsOf !== 'function') return null;
  return dir.reportsOf(user.employeeId).map(String);
}

/**
 * Every employee this caller may see a record of: themselves, plus their direct reports.
 *
 * This is the one definition of "whose data may this caller see". `resolveSubject` decides on it,
 * and `assertRowsWithin` checks tool output against it, so the question a tool asks before it
 * fetches and the question asked of what it returned cannot drift apart.
 *
 * Never throws for an unknown hierarchy — it falls back to self only. That is the safe answer
 * for a check that runs on every result: a manager whose line cannot be confirmed can still read
 * their own leave.
 */
export function allowedEmployeeIds(user) {
  if (isAdmin(user)) return ANY_EMPLOYEE;
  const ids = new Set();
  if (!user?.employeeId) return ids;
  ids.add(String(user.employeeId));
  for (const id of reportsOf(user) ?? []) ids.add(id);
  return ids;
}

/**
 * The employees a team-scoped question may cover: the caller's direct reports, or everyone for an
 * HR admin. `includeSelf` adds the caller, for questions like a lookup where finding yourself is
 * reasonable.
 *
 * **Throws 403 when the reporting line is unknown,** rather than returning an empty set. "Nobody
 * on your team is on leave" and "your team could not be determined" are different answers, and
 * only the second is true in live mode today.
 */
export function teamOf(user, { includeSelf = false } = {}) {
  if (isAdmin(user)) return ANY_EMPLOYEE;
  const reports = reportsOf(user);
  if (reports === null) {
    throw forbidden('Your reporting line could not be confirmed, so team results are withheld.');
  }
  const ids = new Set(reports);
  if (includeSelf && user?.employeeId) ids.add(String(user.employeeId));
  return ids;
}

/** True when `employeeId` is inside an allowed set from the functions above. */
export function isWithin(allowed, employeeId) {
  if (allowed === ANY_EMPLOYEE) return true;
  return employeeId != null && allowed instanceof Set && allowed.has(String(employeeId));
}

/**
 * Verify every row a tool is about to return belongs to someone the caller may see.
 *
 * The tools already filter before they return, so this should never fire. It exists because
 * under the service-account model Zoho applies no narrowing of its own (`data_select=ALL`): the
 * tool's own filter is the only thing between a caller and the organisation, and a bug in it
 * would otherwise be a silent leak. This turns that bug into a 500 with a log line — the same
 * reasoning as `assertScopeHeld` in core/query/engine.js, applied to the chat path.
 *
 * A row with no employee id fails too. A row the check cannot attribute is a row it cannot clear.
 */
export function assertRowsWithin(rows, allowed, { field = 'employeeId' } = {}) {
  if (allowed === ANY_EMPLOYEE) return rows;
  const fail = () => Object.assign(
    new Error("Authorization check failed: a tool returned a row outside the caller's scope."),
    { status: 500 },
  );
  if (!Array.isArray(rows)) throw fail();
  for (const row of rows) if (!isWithin(allowed, row?.[field])) throw fail();
  return rows;
}

/**
 * Resolve which employee a request is about, and refuse if the caller may not ask.
 *
 * You may read yourself, a manager may read a direct report, an admin may read anyone. Decided
 * through `allowedEmployeeIds`, so it is the same rule the result check enforces. The manager
 * check is the one that stops "show me Priya's leave balance" working for someone who is not her
 * manager.
 */
export function resolveSubject(user, employeeId) {
  if (!employeeId || employeeId === 'me' || employeeId === user.employeeId) return user.employeeId;

  if (isAdmin(user)) return employeeId;

  if (isWithin(allowedEmployeeIds(user), employeeId)) return employeeId;

  throw forbidden('You can only see your own records, or your direct reports.');
}
