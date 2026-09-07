/**
 * Unwrapping Zoho People responses.
 *
 * Zoho People answers in two different envelopes, and they are not variations of one shape:
 *
 *   Forms API   GET /people/api/forms/employee/getRecords
 *               a nested result structure keyed by record identifier
 *
 *   v3 API      GET /people/api/v3/leave-tracker/leaves
 *               GET /people/api/v3/attendance/entries
 *               { data: [...], message: string, status: 'success' }
 *
 * They are handled separately on purpose. A single "smart" unwrapper that sniffed which shape it
 * had would silently pick the wrong branch the first time either API changed, and the symptom
 * would be an empty dashboard rather than an error.
 *
 * ## This module unwraps only. It does not map fields.
 *
 * Everything here is about the *envelope*: getting from a response body to an array of raw rows.
 * Turning a raw row into our normalized shape is field mapping, it is different for every module,
 * and it cannot be written yet — every validated call so far returned an empty result, so no
 * leave or attendance field name has actually been observed. Those mappers arrive with the first
 * non-empty payload.
 *
 * ## An empty array is a success
 *
 * `data: []` means "no records in that range", which is a real and common answer — an employee
 * who took no leave in September. It must never surface as an error, and it must never trigger a
 * fallback to seed data. Both would turn "you have no leave" into something else.
 */

/** What a successful unwrap returns, whichever envelope it came from. */
const result = (rows, meta = {}) => ({
  rows,
  empty: rows.length === 0,
  ...meta,
});

/**
 * Raised when a response does not match the envelope we have observed.
 *
 * Distinct from an upstream error: the call succeeded, but the shape changed underneath us. That
 * is a code problem to fix, not a transient failure to retry, so it is worth its own type.
 */
export class EnvelopeError extends Error {
  constructor(message, { payload } = {}) {
    super(message);
    this.name = 'EnvelopeError';
    this.status = 502;
    /** The keys we actually saw, for the log. Never the values — rows carry PII. */
    this.observedKeys = payload && typeof payload === 'object' ? Object.keys(payload) : null;
  }
}

// ---------------------------------------------------------------- v3

/**
 * Unwrap a v3 response: leave-tracker and attendance.
 *
 * Confirmed shape, from two endpoints on 2026-09-07:
 *
 *   { "data": [], "message": "Record(s) fetched successfully.", "status": "success" }
 *   { "data": [], "message": "Request processed successfully.",  "status": "success" }
 *
 * The two `message` strings differ, which is why nothing here reads `message` as a signal — it is
 * carried through for logging and ignored for control flow. `status` is the signal.
 */
export function unwrapV3(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new EnvelopeError('v3: response body is not an object', { payload });
  }

  if (payload.status !== 'success') {
    throw new EnvelopeError(
      `v3: status was ${JSON.stringify(payload.status)}, expected "success"`,
      { payload },
    );
  }

  // A missing `data` key is not the same as an empty one. Empty means "no records"; missing means
  // the shape moved, and treating it as empty would report "no leave" for a broken response.
  if (!Object.prototype.hasOwnProperty.call(payload, 'data')) {
    throw new EnvelopeError('v3: success response has no "data" key', { payload });
  }
  if (!Array.isArray(payload.data)) {
    throw new EnvelopeError(`v3: "data" is ${typeof payload.data}, expected an array`, { payload });
  }

  return result(payload.data, { message: payload.message ?? null });
}

// ---------------------------------------------------------------- forms

/**
 * Flatten the confirmed inner shape of a forms result: records keyed by their identifier.
 *
 *   { "<recordId>": { ...fields } }      -> [ { __recordId, ...fields } ]
 *   { "<recordId>": [ { ...fields } ] }  -> [ { __recordId, ...fields } ]
 *
 * Both nestings are handled because "keyed by a record identifier" describes the key, not whether
 * the value is wrapped in an array, and that detail has not been observed. Neither reading loses
 * information, so accepting both is safer than betting on one.
 *
 * The identifier is attached as `__recordId` rather than as a guessed business field name. What
 * Zoho calls the employee id inside the record — `EmployeeID`, `erecno`, something else — has not
 * been confirmed, and inventing it here is exactly the mapping this phase is not allowed to make.
 * The double underscore marks it as ours, not Zoho's.
 */
export function flattenKeyedRecords(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    throw new EnvelopeError('forms: expected an object keyed by record id', { payload: node });
  }

  const rows = [];
  for (const [recordId, value] of Object.entries(node)) {
    const records = Array.isArray(value) ? value : [value];
    for (const record of records) {
      if (record && typeof record === 'object' && !Array.isArray(record)) {
        rows.push({ __recordId: recordId, ...record });
      }
    }
  }
  return result(rows);
}

/**
 * The path from a forms response body down to the keyed-records node.
 *
 * **Confirmed 2026-09-07** against a real employee payload:
 *
 *   { "response": { "result": [ { "<record_id>": [ { EmailID, "Employee_type.id", ... } ] } ] } }
 *
 * So the path is `response.result`, and what sits there is an ARRAY of keyed-record objects
 * rather than a single one — handled below.
 *
 * The env override remains because a different form or a future API version could nest
 * differently, and changing a variable beats shipping a patch to find out. It is an override
 * now, not a prerequisite: nothing has to be configured for the confirmed shape to work.
 */
export const FORMS_RESULT_PATH =
  parsePath(process.env.ZOHO_PEOPLE_FORMS_RESULT_PATH) ?? ['response', 'result'];

/**
 * Read the path from configuration, so confirming it does not require a code change.
 *
 * `ZOHO_PEOPLE_FORMS_RESULT_PATH=response.result` is all it takes once one real body has been
 * captured. Made configurable rather than hardcoded because the person who captures the body is
 * not necessarily the person who can ship a commit, and the alternative is that they guess.
 */
function parsePath(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.').map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts : null;
}

/**
 * Unwrap a forms response.
 *
 * `response.result` holds an ARRAY of keyed-record objects. Every element is flattened and the
 * results concatenated, rather than assuming a single element: whether Zoho returns one object
 * carrying every record or one object per record was not part of what was captured, and both
 * readings produce the same rows this way. Assuming "length 1" would silently return one
 * employee out of fifty.
 */
export function unwrapForms(payload, path = FORMS_RESULT_PATH) {
  if (!path) {
    throw new EnvelopeError('forms: no result path configured', { payload });
  }

  let node = payload;
  for (const key of path) {
    if (!node || typeof node !== 'object') {
      throw new EnvelopeError(`forms: path ${path.join('.')} does not exist in the response`, { payload });
    }
    node = node[key];
  }

  if (node === undefined || node === null) {
    throw new EnvelopeError(`forms: path ${path.join('.')} does not exist in the response`, { payload });
  }

  // An empty result array is a successful empty read, exactly like `data: []` on the v3 side.
  if (Array.isArray(node)) {
    const rows = [];
    for (const element of node) rows.push(...flattenKeyedRecords(element).rows);
    return result(rows);
  }

  return flattenKeyedRecords(node);
}
