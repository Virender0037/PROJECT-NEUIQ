/**
 * Zoho People attendance entries -> normalized rows. **PENDING — not implemented.**
 *
 * The endpoint is validated and the request layer is built: `GET /people/api/v3/attendance/entries`
 * with `employee_email_id`, `from_date`, `to_date` and `date_format=dd-MMM-yyyy` returns 200, and
 * the v3 envelope unwraps correctly. What does not exist is a single observed attendance RECORD —
 * every call so far has returned `data: []`, because the test employee has none.
 *
 * So there are no field names, and this file will not invent any. It exists as a real module with
 * a real refusal rather than as a comment, because:
 *
 *   - the refusal is testable, and is tested
 *   - the seam is in place, so filling it in is a mapping table and nothing else
 *   - the rest of the integration is not blocked waiting for it
 *
 * ## Why guessing here would be worse than the gap
 *
 * A wrong attendance mapping does not fail loudly. It produces an hours-per-day chart with
 * plausible numbers in it, and nobody can tell by looking that the figures are wrong. An explicit
 * refusal is visible; a wrong number is not.
 *
 * ## What is needed to finish this
 *
 * One non-empty response, plus the answer to a question the field names alone will not settle:
 * **is a row one day, or one check-in/check-out pair?** The seed models one row per employee per
 * month and `seed.js` already flags that real daily data would be roughly 8,600 rows over six
 * months. Per-punch data is larger again, and it changes the aggregation strategy rather than
 * just the field names.
 */

/**
 * Raised on any attempt to transform an attendance record.
 *
 * Carries a 501 rather than a 500: this is not a fault, it is a capability that does not exist
 * yet, and the distinction matters when it shows up in a log.
 */
export class AttendanceTransformerPendingError extends Error {
  constructor() {
    super(
      'attendance: no transformer yet. The endpoint is validated but every response so far has '
      + 'been empty, so no field name has been observed. Capture one non-empty response from '
      + 'GET /people/api/v3/attendance/entries and fill in transformers/attendance.js. '
      + 'Do not guess the field names — a wrong mapping produces plausible wrong hours.',
    );
    this.name = 'AttendanceTransformerPendingError';
    this.status = 501;
    this.pending = true;
  }
}

/** Whether attendance can be transformed at all. Callers check this instead of catching. */
export const ATTENDANCE_TRANSFORMER_READY = false;

/**
 * Transform one attendance record. Always throws while pending.
 *
 * Deliberately NOT a silent no-op returning `[]`. An empty array is indistinguishable from "this
 * employee has no attendance", which is precisely the wrong thing to be unable to tell apart.
 */
export function transformAttendanceRecord(_raw) {
  throw new AttendanceTransformerPendingError();
}

/**
 * Transform a page of attendance records.
 *
 * An empty page is allowed through as an empty array, because that is a real and correct answer
 * that the confirmed envelope already produces — it needs no field mapping. A NON-empty page
 * throws, because mapping it is the part that does not exist.
 */
export function transformAttendanceRecords(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  throw new AttendanceTransformerPendingError();
}

/** What must be answered before this file can be written. */
export const ATTENDANCE_TODO = Object.freeze({
  fields: 'No field name observed. Every response so far returned data: [].',
  granularity:
    'Unknown whether a row is one day or one check-in/check-out pair. This decides the '
    + 'aggregation strategy, not just the mapping.',
  identifier:
    'Unknown which employee identifier appears IN a row. If a row carries both email and erecno '
    + 'it would close the leave/attendance identifier mismatch on its own.',
  volume:
    'seed.js models one row per employee per month; real daily data is ~8,600 rows over six '
    + 'months, and per-punch data is larger. Date filters must be pushed to Zoho, never applied '
    + 'after fetching.',
  scope: 'The authorising OAuth scope was not recorded; scopes.js still lists it as pending.',
});
