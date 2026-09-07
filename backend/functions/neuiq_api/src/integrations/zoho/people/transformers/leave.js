/**
 * Zoho People leave records -> our normalized leave row.
 *
 * Built only from fields observed in a real non-empty response on 2026-09-07:
 *
 *   unit · from_date · to_date · date_of_request · approval_status · leave_id
 *   leave_type.{name,id,type}
 *   employee.{zoho_id,name,avatar,id}
 *   days.<date>.{leave_count,session}
 *
 * Nothing else is read. This is an allow-list, not a rename pass: a field Zoho adds later is
 * dropped rather than carried through. That matters because the output of this function reaches
 * a Gemini prompt, and the employee form alone was already returning Date_of_birth and Gender.
 * A deny-list would leak the next such field the day it appears.
 *
 * ## Two traps worth knowing before editing
 *
 * **Zoho's `days` is not our `days`.** Theirs is an object keyed by date; ours is the single
 * number the query engine aggregates (`numeric: ['days']` in sources.js). The per-date detail is
 * preserved separately as `dayBreakdown`. Writing Zoho's object straight into `days` would give
 * the engine an object to sum and every leave chart would read zero.
 *
 * **`departmentId` cannot be filled from this payload.** `sources.js` declares it groupable on
 * `leave`, and the seed supplies it, but no department field appears in a leave record. It is
 * left absent rather than invented, so on live data a group-by-department leave chart will bucket
 * everything under "—" until the row is enriched from the employee record. That is a known gap,
 * not an oversight — see the note at the bottom of this file.
 *
 * ## Values are passed through, not translated
 *
 * `approval_status` and `unit` are carried verbatim. The field NAMES were confirmed; their VALUE
 * domains were not. The seed uses "Approved"; Zoho may use "APPROVED". Mapping one to the other
 * would be inventing a translation table, so the casing question is left open deliberately and is
 * called out in the gap note below.
 */
import { fromZohoDate, monthKey } from './dates.js';

/** Round a day count without float noise. Half-days are real, thousandths are not. */
const round2 = (n) => Math.round(n * 100) / 100;

/** A leave_count that will not parse contributes zero rather than poisoning the total with NaN. */
function toCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const str = (v) => (typeof v === 'string' && v !== '' ? v : null);

/**
 * The dynamic `days` object -> an ordered list.
 *
 * The key is a date, but its format was not part of the confirmed field list, so it is parsed
 * leniently and the raw key is kept alongside. If Zoho's key format is dd-MMM-yyyy this yields a
 * clean ISO `date`; if it is something else, `date` is null and nothing is lost, because
 * `sourceDate` still holds what was actually sent.
 *
 * Sorted by date because a breakdown out of calendar order reads as corrupted data.
 */
export function transformDayBreakdown(days) {
  if (!days || typeof days !== 'object' || Array.isArray(days)) return [];

  const entries = Object.entries(days).map(([key, value]) => {
    const day = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      date: fromZohoDate(key),
      sourceDate: key,
      leaveCount: toCount(day.leave_count),
      session: str(day.session),
    };
  });

  // Nulls last: an unparseable key should not sort into the middle of a real sequence.
  return entries.sort((a, b) => {
    if (a.date === b.date) return 0;
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date.localeCompare(b.date);
  });
}

/**
 * One raw Zoho leave record -> one normalized row, or null if it is not an object.
 *
 * `includeAvatar` is off by default. An avatar is a URL to a photograph: useless to the query
 * engine, personal to the employee, and a link in a prompt is something a model may try to treat
 * as an instruction. It is opt-in rather than filtered downstream, so the default path cannot
 * carry it by accident.
 */
export function transformLeaveRecord(raw, { includeAvatar = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const leaveType = raw.leave_type && typeof raw.leave_type === 'object' ? raw.leave_type : {};
  const employee = raw.employee && typeof raw.employee === 'object' ? raw.employee : {};

  const from = fromZohoDate(raw.from_date);
  const dayBreakdown = transformDayBreakdown(raw.days);

  const row = {
    // ---- identity ----
    recordId: str(raw.leave_id),
    /**
     * The canonical Zoho employee identifier for leave, and the field the query engine scopes on.
     *
     * It is `employee.zoho_id` because that is what the endpoint's own `employee_zoho_ids`
     * request parameter takes — request and response agree, so a scoped read and a scoped filter
     * are talking about the same thing.
     *
     * A row missing it fails CLOSED: the scope filter compares `undefined === '<caller>'`, which
     * is false, so an unidentifiable row is excluded from a scoped read rather than leaking into
     * one.
     */
    employeeId: str(employee.zoho_id),
    /** The other identifier Zoho returns. Its relationship to zoho_id is unconfirmed. */
    employeeAltId: str(employee.id),
    employeeName: str(employee.name),

    // ---- what the query engine groups and aggregates on ----
    leaveType: str(leaveType.name),
    status: str(raw.approval_status),
    days: round2(dayBreakdown.reduce((sum, d) => sum + d.leaveCount, 0)),
    from,
    month: monthKey(from),

    // ---- detail ----
    to: fromZohoDate(raw.to_date),
    requestedOn: fromZohoDate(raw.date_of_request),
    unit: str(raw.unit),
    leaveTypeId: str(leaveType.id),
    /** `leave_type.type`. Carried through; its value domain has not been observed. */
    leaveTypeCategory: str(leaveType.type),
    dayBreakdown,
  };

  if (includeAvatar) row.employeeAvatar = str(employee.avatar);

  return row;
}

/** A page of raw records -> normalized rows. Anything that is not an object is dropped. */
export function transformLeaveRecords(rows, opts) {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => transformLeaveRecord(r, opts)).filter(Boolean);
}

/**
 * The fields this transformer reads. Exported so a test can assert the allow-list has not
 * quietly widened, and so the gap below stays visible in code rather than only in a comment.
 */
export const CONFIRMED_LEAVE_FIELDS = Object.freeze([
  'unit', 'from_date', 'to_date', 'date_of_request', 'approval_status', 'leave_id',
  'leave_type.name', 'leave_type.id', 'leave_type.type',
  'employee.zoho_id', 'employee.name', 'employee.avatar', 'employee.id',
  'days.<date>.leave_count', 'days.<date>.session',
]);

/**
 * Known gaps, recorded here so they are not rediscovered as bugs.
 *
 * Both are missing information, not missing code. Neither can be closed without another
 * observation, and guessing either would produce charts that look right and are wrong.
 */
export const LEAVE_GAPS = Object.freeze({
  departmentId:
    'No department field appears in a leave record. `sources.js` declares departmentId groupable '
    + 'on leave and the seed supplies it, so on live data that grouping collapses to "—" until '
    + 'rows are enriched from the employee record.',
  statusValues:
    'approval_status VALUES are unobserved. The seed uses "Approved"; Zoho may use "APPROVED". '
    + 'Values are passed through untranslated rather than guessing a mapping.',
  dayKeyFormat:
    'The format of the keys inside `days` was not confirmed. Parsed leniently, with the raw key '
    + 'kept as sourceDate so nothing is lost if it is not dd-MMM-yyyy.',
});
