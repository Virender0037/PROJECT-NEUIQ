/**
 * Zoho People employee form records -> our normalized employee row.
 *
 * ## What is actually confirmed
 *
 * Far less than for leave. The employee endpoint returns 200 with real data, but the only field
 * names observed are:
 *
 *   EmailID · Employee_type.id · Department · Date_of_birth · Gender
 *
 * plus `__recordId`, which envelope.js attaches from the key the record was filed under.
 *
 * The response was described as carrying "other People form fields" — those are not enumerated,
 * so they are not mapped. Notably still unknown: the employee ID field, first and last name,
 * designation, location, and the reporting-manager field.
 *
 * ## Two of the five confirmed fields are deliberately thrown away
 *
 * `Date_of_birth` and `Gender` are read by this module only so that dropping them is explicit and
 * testable. They have no use in a leave chart or an HR question, they are exactly the class of
 * field that must never reach a Gemini prompt, and their presence in the very first payload we saw
 * is the concrete reason this layer is an allow-list rather than a rename pass.
 *
 * ## What this unblocks even while incomplete
 *
 * `EmailID` + `__recordId` is the **email -> record id** pair the identity chain needs. Attendance
 * takes `employee_email_id` and leave takes `employee_zoho_ids` (erecno), so nothing can join the
 * two without this mapping. Whether `__recordId` IS the erecno is unconfirmed — see the gap note.
 */

/**
 * A field as a string, or null.
 *
 * A number is accepted only while it is a safe integer (or a finite non-integer). An unsafe
 * integer has ALREADY been rounded by whoever parsed it — `_shared/client.js` keeps those as exact
 * strings precisely so they never reach here as numbers — and `String()` of it would be a
 * plausible-looking wrong id. Null fails closed; a wrong id could match the wrong person.
 */
const str = (v) => {
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number') return Number.isFinite(v) && (!Number.isInteger(v) || Number.isSafeInteger(v)) ? String(v) : null;
  return null;
};

/**
 * Read a Zoho lookup field.
 *
 * **`Employee_type.id` is a flat key containing a dot, not a nested object.** The captured payload
 * is `{ "Employee_type.id": "..." }`, not `{ "Employee_type": { "id": "..." } }`. An earlier draft
 * of this file assumed the nested form and would have read `undefined` from every record — a
 * whole column quietly empty, with nothing failing. The flat key is what is confirmed and is read
 * first; the nested form is accepted only as a fallback, because it costs a line and neither
 * reading can produce a wrong value.
 */
function lookupId(raw, base) {
  const flat = raw?.[`${base}.id`];
  if (flat != null) return str(flat);

  const nested = raw?.[base];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) return str(nested.id);
  return str(nested);
}

/**
 * One raw employee record -> one normalized row.
 *
 * Fields not in the confirmed list are dropped, including any that arrive later. That is the
 * point: the payload already contains date of birth and gender, and a deny-list would carry the
 * next such field the day Zoho adds it.
 */
export function transformEmployeeRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  return {
    /**
     * The identifier the record was filed under in the forms envelope.
     *
     * Whether this is the `erecno` that leave's `employee_zoho_ids` expects is UNCONFIRMED. It is
     * named `recordId` rather than `erecno` or `employeeId` so nothing downstream can mistake an
     * assumption for a fact.
     */
    recordId: str(raw.__recordId),

    /** The join key. Attendance addresses employees by this, and it is the only cross-API handle. */
    email: str(raw.EmailID),

    department: str(raw.Department),
    employmentTypeId: lookupId(raw, 'Employee_type'),

    // Date_of_birth, Gender, Photo and every unlisted field are deliberately NOT emitted.
    // See DROPPED_PII_FIELDS and the header.
  };
}

/** A page of raw records -> normalized rows. Anything unusable is dropped. */
export function transformEmployeeRecords(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(transformEmployeeRecord).filter(Boolean);
}

/**
 * email -> recordId, for the identity chain.
 *
 * Lower-cased because an email match that depends on casing will fail for exactly one person and
 * nobody will work out why. Records without both halves are skipped rather than producing a
 * partial map that looks complete.
 */
export function buildEmailIndex(rows) {
  const index = new Map();
  for (const row of transformEmployeeRecords(rows)) {
    if (row.email && row.recordId) index.set(row.email.toLowerCase(), row.recordId);
  }
  return index;
}

/**
 * The fields observed in the captured payload. Exported so a test can assert the allow-list has
 * not quietly widened.
 */
export const CONFIRMED_EMPLOYEE_FIELDS = Object.freeze([
  'EmailID', 'Employee_type.id', 'Department', 'Date_of_birth', 'Gender',
]);

/** Of those, the ones emitted. Anything not here never leaves this module. */
export const ALLOWED_EMPLOYEE_FIELDS = Object.freeze([
  '__recordId', 'EmailID', 'Employee_type.id', 'Department',
]);

/**
 * Confirmed fields read and deliberately discarded, plus the classes of field that must stay out
 * if they appear later. `Photo` is listed ahead of being seen because a photo URL is the same
 * problem as leave's `employee.avatar`: personal, useless to a query, and a link a model may try
 * to follow.
 */
export const DROPPED_PII_FIELDS = Object.freeze([
  'Date_of_birth', 'Gender', 'Photo', 'Personal_Mobile', 'PAN', 'Salary',
]);

/**
 * Known gaps. Recorded so they are not rediscovered as bugs, and so nobody fills them by guessing.
 */
export const EMPLOYEE_GAPS = Object.freeze({
  identifiers:
    'RESOLVED (2026-10-13): __recordId is the canonical id and equals Zoho_ID and leave '
    + "employee.zoho_id exactly (the erecno employee_zoho_ids takes), once 18-digit numbers are "
    + 'parsed precision-safely. ZUID is the separate Zoho ACCOUNT id. Identity lives in '
    + 'transformers/employeeIdentity.js, not in this HR-facing transformer.',
  names:
    'FirstName/LastName are now observed and carried by the IDENTITY transformer only '
    + '(employeeIdentity.js). This transformer still emits no name, so employeeLookup still matches '
    + 'on email until a tool is deliberately given names.',
  orgFields:
    'Reporting_To.ID (the manager __recordId) is now observed and indexed by the employee '
    + 'directory (employeeDirectory.js), but the manager -> direct-reports relationship is NOT yet '
    + 'used for authorization: team-scoped reads stay refused in live mode until E3 wires it in. '
    + 'Designation and location are still not mapped, so headcount groups by department only.',
});
