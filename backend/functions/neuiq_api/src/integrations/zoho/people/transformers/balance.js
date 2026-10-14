/**
 * Zoho People Booked and Balance report -> our leave-balance rows.
 *
 * ## The response, as observed 2026-10-13
 *
 *   leavetypes: { <leaveTypeId>: { unit, code, name, type } }
 *   report:     { <erecno>: { <leaveTypeId>: { balance, booked? }, totals: {...}, employee: { name, id } } }
 *   employees:  [ <erecno> ]
 *
 * ## The rule this file exists to enforce: unavailable is never zero
 *
 * A balance the transformer cannot fully account for is REFUSED, not defaulted. A missing
 * `balance` is not 0, an unknown leave type is not skipped, and a report that came back without
 * the requested employee is not "no leave". Each of those, rendered as a number, is a plausible
 * wrong answer about someone's leave — worse than saying it is unavailable.
 *
 * ## Allow-list
 *
 * Out: leaveTypeId, leaveType, category, unit, balance, booked — nothing else. Dropped:
 * `report.<erecno>.employee` (name and employee number), `totals`, the leave type `code`, and
 * everything Zoho adds later.
 *
 * ## Scope
 *
 * The request names exactly one employee. A report holding anyone else means Zoho did not apply
 * the filter, and the response is refused whole — never trimmed to the requested employee and
 * served, because a filter that silently stopped working must surface, not be papered over.
 */

/** Exactly the fields a balance row carries. */
export const BALANCE_FIELDS = Object.freeze(['leaveTypeId', 'leaveType', 'category', 'unit', 'balance', 'booked']);

/** Fields in the raw report deliberately dropped. Asserted by test. */
export const DROPPED_BALANCE_FIELDS = Object.freeze(['employee', 'totals', 'code']);

/**
 * Why a balance is unavailable. Every reason is a refusal; none produces a figure.
 *
 * 503 for "cannot give you this right now / here", 502 when Zoho's answer itself was wrong.
 */
export const BALANCE_UNAVAILABLE = Object.freeze({
  PERIOD_NOT_CONFIGURED: 'PERIOD_NOT_CONFIGURED',
  NOT_LINKED: 'NOT_LINKED',
  NO_DATA: 'NO_DATA',
  MALFORMED: 'MALFORMED',
  SCOPE_MISMATCH: 'SCOPE_MISMATCH',
});

export class LeaveBalanceUnavailableError extends Error {
  constructor(reason, message, status = 503) {
    super(`Leave balance unavailable: ${message}`);
    this.name = 'LeaveBalanceUnavailableError';
    this.status = status;
    this.code = reason;
    this.unavailable = true;
  }
}

/**
 * A Zoho erecno: the employee form's `__recordId`, a string of digits.
 *
 * Strict on purpose. A seed id ("E1001"), an email, a number (already rounded if it was 18
 * digits), a list, or anything with punctuation is refused before a request is built — the value
 * goes into a JSON array in a query string, and only a value that cannot be anything but one id
 * belongs there.
 */
export const isZohoRecordId = (v) => typeof v === 'string' && /^\d{6,30}$/.test(v);

const unavailable = (reason, message, status) => new LeaveBalanceUnavailableError(reason, message, status);
const plainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * One report body + the employee it was requested for -> balance rows.
 *
 * Throws LeaveBalanceUnavailableError for anything it cannot fully account for. Never returns a
 * partial or defaulted row.
 */
export function transformLeaveBalanceReport(body, { employeeId } = {}) {
  if (!isZohoRecordId(employeeId)) {
    throw unavailable(BALANCE_UNAVAILABLE.NOT_LINKED, 'no Zoho employee record id to read.');
  }
  if (!plainObject(body) || !plainObject(body.leavetypes) || !plainObject(body.report)) {
    throw unavailable(BALANCE_UNAVAILABLE.MALFORMED, 'Zoho returned an unexpected report shape.', 502);
  }

  // ---- scope: the requested employee and nobody else ----
  const reported = Object.keys(body.report);
  const listed = body.employees === undefined ? [] : body.employees;
  if (!Array.isArray(listed)) {
    throw unavailable(BALANCE_UNAVAILABLE.MALFORMED, 'Zoho returned an unexpected report shape.', 502);
  }
  if (reported.some((id) => id !== employeeId) || listed.some((id) => String(id) !== employeeId)) {
    throw unavailable(BALANCE_UNAVAILABLE.SCOPE_MISMATCH, 'Zoho returned employees other than the one requested.', 502);
  }

  const entry = body.report[employeeId];
  if (!plainObject(entry)) {
    throw unavailable(BALANCE_UNAVAILABLE.NO_DATA, 'Zoho has no leave balance for this employee in the report period.');
  }

  // ---- rows: every leave-type key must be fully accounted for ----
  const rows = [];
  for (const [key, value] of Object.entries(entry)) {
    if (DROPPED_BALANCE_FIELDS.includes(key)) continue;
    const meta = body.leavetypes[key];
    if (!plainObject(meta) || !plainObject(value)) {
      throw unavailable(BALANCE_UNAVAILABLE.MALFORMED, 'a leave type in the report could not be identified.', 502);
    }
    if (typeof meta.name !== 'string' || meta.name.trim() === '' || typeof meta.unit !== 'string' || meta.unit === '') {
      throw unavailable(BALANCE_UNAVAILABLE.MALFORMED, 'a leave type is missing its name or unit.', 502);
    }
    // balance is required and must be a real number. Missing is unavailable, not 0.
    if (!finite(value.balance)) {
      throw unavailable(BALANCE_UNAVAILABLE.MALFORMED, `no usable balance for "${meta.name}".`, 502);
    }
    // booked is optional — observed absent on some rows. Absent is unknown (null), not 0; present
    // but not a number is malformed.
    if (value.booked !== undefined && value.booked !== null && !finite(value.booked)) {
      throw unavailable(BALANCE_UNAVAILABLE.MALFORMED, `an unusable booked value for "${meta.name}".`, 502);
    }
    rows.push({
      leaveTypeId: key,                       // an object key: always the exact string Zoho sent
      leaveType: meta.name.trim(),
      category: meta.type === 'PAID' || meta.type === 'UNPAID' ? meta.type : null,
      unit: meta.unit,
      balance: value.balance,
      booked: finite(value.booked) ? value.booked : null,
    });
  }

  if (!rows.length) {
    throw unavailable(BALANCE_UNAVAILABLE.NO_DATA, 'Zoho reported no leave types for this employee.');
  }
  return rows.sort((a, b) => a.leaveType.localeCompare(b.leaveType));
}
