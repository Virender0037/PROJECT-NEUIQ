/**
 * Leave approval status — one vocabulary for the seed and live Zoho People, and one rule for what
 * counts as approved leave.
 *
 * ## Why this exists
 *
 * Every consumer used to compare `status === 'Approved'`, the seed's spelling. Live Zoho does not
 * spell it that way, and does not even agree with itself:
 *
 *   - the v3 leave endpoint's `approval_status` FILTER documents
 *     APPROVED | PENDING | REJECTED | CANCELLED | CANCEL_PENDING (upper case);
 *   - the same page's SAMPLE RESPONSE shows "Pending" (title case);
 *   - the one live record observed (2026-10-13) carried "NO_STATUS", which neither lists.
 *
 * So on live data nothing ever matched: no leave counted as taken, nobody was ever on leave, and
 * the pending-approvals figure read 0. Mapping happens once, in the leave transformer, through
 * this module, case-insensitively.
 *
 * ## Only APPROVED is approved
 *
 * `NO_STATUS` is undocumented. It may mean the leave type has no approval workflow, or that the
 * request has not entered one, or something else — there is no evidence either way, so it is NOT
 * treated as approved. `CANCEL_PENDING` is probably approved leave awaiting a cancellation
 * decision, but that is unconfirmed too, so it is not counted either. Under-counting leave someone
 * took is a visible, correctable gap; counting leave that was never approved misstates a person's
 * record.
 *
 * ## Normalised values are the seed's labels
 *
 * `Approved`, `Pending`, `Rejected` are what the seed already emits, so a dashboard grouped or
 * filtered by status means the same thing on either data source. Normalising is idempotent:
 * a normalised label maps to itself.
 *
 * Imports nothing, so it can be asserted under plain `node`.
 */

/** The normalised statuses. Display labels, and the values the query engine groups on. */
export const LEAVE_STATUS = Object.freeze({
  APPROVED: 'Approved',
  PENDING: 'Pending',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  CANCEL_PENDING: 'Cancellation pending',
  NO_STATUS: 'No status',
  /** A value Zoho sent that is not in the table. Kept visible, never counted as approved. */
  UNRECOGNISED: 'Unrecognised',
});

/**
 * Raw value (upper-cased, spaces and hyphens folded to `_`) -> normalised status.
 *
 * Includes each normalised label's own folded form, so `normaliseLeaveStatus` is idempotent and a
 * seed row ('Approved') needs no special case.
 */
const MAP = Object.freeze({
  APPROVED: LEAVE_STATUS.APPROVED,
  PENDING: LEAVE_STATUS.PENDING,
  REJECTED: LEAVE_STATUS.REJECTED,
  CANCELLED: LEAVE_STATUS.CANCELLED,
  CANCEL_PENDING: LEAVE_STATUS.CANCEL_PENDING,
  CANCELLATION_PENDING: LEAVE_STATUS.CANCEL_PENDING,
  NO_STATUS: LEAVE_STATUS.NO_STATUS,
  UNRECOGNISED: LEAVE_STATUS.UNRECOGNISED,
});

const fold = (raw) => String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_');

/**
 * Any Zoho or seed status -> the normalised status.
 *
 * Missing (null, undefined, empty) is `null`, not a status: "Zoho sent nothing" and "Zoho sent
 * NO_STATUS" are different observations. An unknown value is `Unrecognised` rather than passed
 * through, so a new Zoho value shows up as one bucket instead of silently forming its own.
 */
export function normaliseLeaveStatus(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') return LEAVE_STATUS.UNRECOGNISED;
  if (raw.trim() === '') return null;
  return MAP[fold(raw)] ?? LEAVE_STATUS.UNRECOGNISED;
}

/**
 * Does this leave count as approved — taken against a balance, or "on leave" today?
 *
 * Takes a row (reads `.status`) or a status string, normalised or raw. True for APPROVED only.
 */
export function isApprovedLeave(rowOrStatus) {
  const s = rowOrStatus && typeof rowOrStatus === 'object' ? rowOrStatus.status : rowOrStatus;
  return normaliseLeaveStatus(s) === LEAVE_STATUS.APPROVED;
}

/**
 * Does a row match a status someone asked for (`leaveRecords` with `status: "approved"`)?
 *
 * A recognised query compares normalised to normalised, so "approved", "APPROVED" and "Approved"
 * agree. An UNrecognised query is never allowed to match the `Unrecognised` bucket wholesale —
 * it compares against the raw value instead, so asking for "foo" finds only rows Zoho sent "foo".
 */
export function matchesLeaveStatus(row, query) {
  const want = normaliseLeaveStatus(query);
  if (want === null) return true;
  if (want !== LEAVE_STATUS.UNRECOGNISED) return row?.status === want;
  const raw = row?.statusRaw ?? row?.status;
  return typeof raw === 'string' && fold(raw) === fold(query);
}

/**
 * The count for one status out of a `groupBy: 'status'` query result (`[{name, value}]`).
 * What the analytics summary's pending-approvals figure reads.
 */
export function countWithStatus(groups, status) {
  const want = normaliseLeaveStatus(status);
  return (Array.isArray(groups) ? groups : []).find((g) => g?.name === want)?.value ?? 0;
}
