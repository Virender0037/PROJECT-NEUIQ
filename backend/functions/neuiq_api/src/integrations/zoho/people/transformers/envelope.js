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
 * **Not confirmed.** What has been observed is that the employee endpoint returns 200 and that
 * the result is "nested and keyed by a record identifier" — the shape of the inner node, not the
 * names of the wrapper keys around it. Zoho's forms APIs have used more than one wrapper across
 * versions, so writing one here would be inventing API behaviour.
 *
 * Set this to the observed path (e.g. `['response', 'result']`) once a real body has been
 * captured. `unwrapForms` refuses to run until then; `flattenKeyedRecords` above already handles
 * everything below this point and is tested.
 */
export const FORMS_RESULT_PATH = null;

/**
 * Unwrap a forms response.
 *
 * Throws until FORMS_RESULT_PATH is confirmed. That refusal is deliberate and is covered by a
 * test: a plausible-looking guess here would produce an empty employee list, which reads as "this
 * org has no employees" rather than as "we are looking in the wrong place".
 */
export function unwrapForms(payload, path = FORMS_RESULT_PATH) {
  if (!path) {
    throw new EnvelopeError(
      'forms: the result path is not confirmed yet. Capture one real response body from ' +
      'GET /people/api/forms/employee/getRecords, set FORMS_RESULT_PATH, and the inner ' +
      'flattening (flattenKeyedRecords) is already in place.',
      { payload },
    );
  }

  let node = payload;
  for (const key of path) {
    if (!node || typeof node !== 'object') {
      throw new EnvelopeError(`forms: path ${path.join('.')} does not exist in the response`, { payload });
    }
    node = node[key];
  }

  // Some forms responses wrap the keyed node in a single-element array.
  const target = Array.isArray(node) && node.length === 1 ? node[0] : node;
  return flattenKeyedRecords(target);
}
