/**
 * The leave-balance report period — configured, never guessed.
 *
 * ## Why this is configuration
 *
 * Zoho's Booked and Balance report takes `from` and `to` and documents them only as "report start
 * date of the current year" and "report till date" (default: today). The organisation's leave
 * year is a Zoho setting this integration cannot read: it may be January–December, April–March, or
 * anything else. Assuming the calendar year would produce a confident balance for the wrong
 * period, so the start is configuration:
 *
 *   ZOHO_PEOPLE_LEAVE_YEAR_START=MM-DD     e.g. 01-01 (calendar year) or 04-01 (April–March)
 *
 * Unset or invalid -> the period cannot be established -> the balance is UNAVAILABLE. No default.
 *
 * ## The policy, once configured
 *
 *   from  = the start of the leave year containing today
 *   to    = today
 *   asOf  = today
 *
 * `to = today` matches the report's documented default. What Zoho means by `balance` and `booked`
 * relative to that window (balance as of `to` or as of year end; whether `booked` includes pending
 * or future-dated leave) is NOT confirmed, and every result carries that statement rather than
 * presenting the figures as a current entitlement.
 *
 * Imports nothing; dates are ISO strings in UTC.
 */

export const LEAVE_YEAR_ENV = 'ZOHO_PEOPLE_LEAVE_YEAR_START';

/** Stated on every result, so nobody reads the figures as more than they are. */
export const BALANCE_SEMANTICS = Object.freeze({
  basis: 'Zoho People Booked and Balance report, for the configured leave year to date.',
  unconfirmed: 'Whether balance is as of the report end date or the leave-year end, and whether booked includes pending or future-dated leave, is not confirmed. This is not a statement of entitlement.',
});

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Parse "MM-DD". Returns { month, day } or null.
 *
 * 02-29 is refused: a leave year that starts on a day most years do not have is a configuration
 * error, not something to round.
 */
export function parseLeaveYearStart(raw) {
  const m = /^(\d{2})-(\d{2})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;
  return { month, day };
}

const iso = (y, m, d) => `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/**
 * The report period for `now`, or null when the leave year is not configured validly.
 *
 * Null rather than a throw so the caller decides how to refuse — the tool turns it into an
 * unavailable error that names the missing setting.
 */
export function leaveBalancePeriod(rawStart, now = new Date()) {
  const start = parseLeaveYearStart(rawStart);
  if (!start) return null;
  const y = now.getUTCFullYear();
  const today = iso(y, now.getUTCMonth() + 1, now.getUTCDate());
  const thisYearStart = iso(y, start.month, start.day);
  const from = today >= thisYearStart ? thisYearStart : iso(y - 1, start.month, start.day);
  return {
    from,
    to: today,
    asOf: today,
    leaveYearStart: iso(0, start.month, start.day).slice(5),
    ...BALANCE_SEMANTICS,
  };
}
