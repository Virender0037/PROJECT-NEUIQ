/**
 * Zoho People's wire date format, converted at the boundary.
 *
 * The leave and attendance endpoints take and return `dd-MMM-yyyy` — `01-Sep-2026`. Our
 * normalized shape is ISO `yyyy-MM-dd`, and that is not a preference: the query engine groups by
 * `month` and sorts on the raw key precisely because `2026-03` orders correctly and `Mar 2026`
 * does not. A Zoho-formatted date reaching `core/` would silently shuffle every trend line.
 *
 * So this module is the only place either format meets the other, and it converts in both
 * directions: ISO out to a request parameter, Zoho in from a response field.
 *
 * ## Why the month table is hardcoded
 *
 * `MMM` is a locale-sensitive abbreviation. `toLocaleDateString` on a server running a non-English
 * locale produces a month name Zoho does not recognise, and the failure is not loud — the request
 * is either rejected with a generic error or, worse, accepted with a range nobody intended. The
 * table below is fixed English and never consults the runtime locale.
 *
 * ## Why the two directions behave differently on bad input
 *
 * Outbound throws; inbound returns null. A malformed date going OUT means we are about to ask
 * Zoho a question we did not mean to ask, and a wrong date range returns wrong numbers that look
 * right — that must stop. A malformed date coming IN is one bad field in somebody's record, and
 * crashing a whole page over it is a worse outcome than a null the caller can skip.
 */

/** Fixed English abbreviations. Never derived from the runtime locale. */
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MONTH_INDEX = new Map(MONTHS.map((m, i) => [m.toLowerCase(), i]));

/** The value Zoho expects for the `date_format` query parameter. */
export const ZOHO_DATE_FORMAT = 'dd-MMM-yyyy';

const pad2 = (n) => String(n).padStart(2, '0');

/** Is this y/m/d an actual calendar date? Rejects 2026-02-31 and friends. */
function isRealDate(year, monthIndex, day) {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return d.getUTCFullYear() === year
    && d.getUTCMonth() === monthIndex
    && d.getUTCDate() === day;
}

/**
 * ISO `yyyy-MM-dd` -> Zoho `dd-MMM-yyyy`.
 *
 * Throws on anything that is not a real ISO calendar date. This is the outbound direction: the
 * caller is building a query, and a bad range must never become a silent wrong answer.
 */
export function toZohoDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? '').trim());
  if (!m) {
    throw new Error(`dates: expected ISO yyyy-MM-dd, got ${JSON.stringify(iso)}`);
  }
  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  const day = Number(m[3]);

  if (monthIndex < 0 || monthIndex > 11 || !isRealDate(year, monthIndex, day)) {
    throw new Error(`dates: ${iso} is not a real calendar date`);
  }
  return `${pad2(day)}-${MONTHS[monthIndex]}-${year}`;
}

/**
 * Zoho `dd-MMM-yyyy` -> ISO `yyyy-MM-dd`.
 *
 * Returns null for anything unparseable. Lenient about case and about an unpadded day, because
 * those are cosmetic variations that carry the same meaning; strict about the month name and
 * about the date being real, because those change what the value means.
 */
export function fromZohoDate(value) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(value ?? '').trim());
  if (!m) return null;

  const monthIndex = MONTH_INDEX.get(m[2].toLowerCase());
  if (monthIndex === undefined) return null;

  const day = Number(m[1]);
  const year = Number(m[3]);
  if (!isRealDate(year, monthIndex, day)) return null;

  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

/**
 * ISO date -> `yyyy-MM`, the key the query engine groups and sorts on.
 *
 * Returns null rather than throwing, because it runs on inbound data alongside fromZohoDate.
 */
export function monthKey(iso) {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(iso ?? '').trim());
  return m ? `${m[1]}-${m[2]}` : null;
}

/**
 * Build the date parameters every leave and attendance request needs.
 *
 * Kept here rather than in the client so that the format constant, the conversion and the
 * parameter names travel together — the three are one decision, and splitting them is how a
 * caller ends up sending ISO with a `dd-MMM-yyyy` format flag.
 */
export function dateRangeParams(fromIso, toIso) {
  const from = toZohoDate(fromIso);
  const to = toZohoDate(toIso);
  if (from > to && fromIso > toIso) {
    throw new Error(`dates: from_date ${fromIso} is after to_date ${toIso}`);
  }
  return { from_date: from, to_date: to, date_format: ZOHO_DATE_FORMAT };
}
