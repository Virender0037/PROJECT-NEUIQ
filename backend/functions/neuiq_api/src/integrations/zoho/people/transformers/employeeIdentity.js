/**
 * Zoho People employee record -> the IDENTITY of an employee, and nothing else.
 *
 * Separate from transformers/employee.js on purpose. That one feeds HR functionality (headcount by
 * department, lookup by email) and its four-field output is asserted by test; this one feeds the
 * identity directory that sign-in will map a verified Zoho account onto (Phase 5). Sharing one
 * allow-list would mean every field one needs leaks into the other.
 *
 * ## The allow-list (approved 2026-10-13, Phase 5.3)
 *
 *   recordId          __recordId — the canonical employee id (the erecno; equals Zoho_ID exactly)
 *   zuid              ZUID — the Zoho ACCOUNT id; what a verified sign-in will be matched on
 *   status            Employeestatus, verbatim; `active` is true ONLY for exactly "Active"
 *   managerRecordId   Reporting_To.ID — the manager's __recordId, or null
 *   firstName         FirstName
 *   lastName          LastName
 *
 * Everything else is dropped — email, department, role, dates of birth, national ids, addresses,
 * phone numbers, photos, marital status — including fields Zoho adds later. Zoho's `Role` field
 * ("Admin", "Team member") is NOT read: it is a Zoho permission, not an HR one, and nothing in
 * NeuIQ may grant access from it.
 *
 * ## Identifiers are exact strings, or they are invalid
 *
 * Zoho sends 18-digit ids as JSON numbers; _shared/client.js keeps them as their exact source
 * strings. Here an id is accepted only as a string of digits (or a number small enough to be exact,
 * like a 9-digit ZUID). An unsafe number has ALREADY been rounded by whoever parsed it, so it is
 * rejected — never String()-ed into a plausible wrong id.
 *
 * Imports nothing, so every rule is testable under plain node.
 */

/** Exactly the fields an identity entry carries. Asserted by test. */
export const IDENTITY_FIELDS = Object.freeze(['recordId', 'zuid', 'status', 'active', 'managerRecordId', 'firstName', 'lastName']);

/** The source fields read. Anything not here never leaves this module. */
export const IDENTITY_SOURCE_FIELDS = Object.freeze(['__recordId', 'Zoho_ID', 'ZUID', 'Employeestatus', 'Reporting_To.ID', 'FirstName', 'LastName']);

/** The one status that counts as active. Case-sensitive and exact: "active", "Active " are not it. */
export const ACTIVE_STATUS = 'Active';

const MAX_NAME = 80;

/**
 * An identifier as an exact digit string, or null.
 *
 *   "555000000012345678"  -> "555000000012345678"
 *   812345678 (a number)  -> "812345678"   (safe, so exact)
 *   5.55e17 (a number)    -> null          (unsafe: already rounded)
 *   "E1001", "", "12 3"   -> null
 */
export function exactId(v) {
  if (typeof v === 'string') return /^\d{1,30}$/.test(v) ? v : null;
  if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return String(v);
  return null;
}

const name = (v) => {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, MAX_NAME) : null;
};

/**
 * One raw employee record (as unwrapForms flattens it) -> { entry, problems }.
 *
 * `entry` is null when the record cannot be identified at all. `problems` are CODES — never values —
 * for the directory's aggregate diagnostics:
 *
 *   missing_record_id   no usable __recordId                         -> excluded
 *   record_id_mismatch  Zoho_ID present and not equal to __recordId  -> excluded (which one is it?)
 *   missing_zuid        no usable ZUID                               -> kept, but can never sign in
 *   invalid_manager     Reporting_To.ID present but not an id        -> kept, manager dropped
 *   self_manager        reports to themselves                        -> kept, manager dropped
 */
export function transformEmployeeIdentity(raw) {
  const problems = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { entry: null, problems: ['missing_record_id'] };

  const recordId = exactId(raw.__recordId);
  if (!recordId) return { entry: null, problems: ['missing_record_id'] };

  // Zoho_ID is the same id as the record key. If it is present and disagrees, the record cannot be
  // trusted to be who it says it is — refuse it rather than pick one.
  if (raw.Zoho_ID !== undefined && raw.Zoho_ID !== null && raw.Zoho_ID !== '' && exactId(raw.Zoho_ID) !== recordId) {
    return { entry: null, problems: ['record_id_mismatch'] };
  }

  const zuid = exactId(raw.ZUID);
  if (!zuid) problems.push('missing_zuid');

  const rawManager = raw['Reporting_To.ID'];
  let managerRecordId = null;
  if (rawManager !== undefined && rawManager !== null && rawManager !== '') {
    managerRecordId = exactId(rawManager);
    if (!managerRecordId) problems.push('invalid_manager');
    else if (managerRecordId === recordId) { problems.push('self_manager'); managerRecordId = null; }
  }

  const status = typeof raw.Employeestatus === 'string' ? raw.Employeestatus : null;

  const entry = Object.freeze({
    recordId,
    zuid,
    status,
    active: status === ACTIVE_STATUS,
    managerRecordId,
    firstName: name(raw.FirstName),
    lastName: name(raw.LastName),
  });
  return { entry, problems };
}
