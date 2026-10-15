/**
 * Zoho People endpoints, recorded as evidence rather than intent.
 *
 * Same discipline as _shared/scopes.js: what is written here has actually returned 200 — against
 * the India organisation by curl (2026-09-07), and/or the approved .com development/test
 * organisation through this code (2026-10-13/14), as each entry says. Neither organisation is a
 * confirmed production organisation. Documented-but-untried parameters are listed separately and are not
 * used, because the one time this project reasoned a value out from documentation
 * (`ZohoPeople.leave.READ`) it was wrong in both casing and granularity.
 *
 * This module holds paths and parameter names only. Response FIELD names live with their
 * transformer, and value domains are not recorded here at all — several are still unobserved.
 */

/** Endpoints confirmed against the live tenant. */
export const CONFIRMED_ENDPOINTS = {
  /**
   * Paging confirmed 2026-10-14 against the .com test organisation (2 employees, 3 requests):
   * `sIndex` is 1-based and honoured, `limit` is honoured (limit=1 returned one record), and
   * sIndex=2 returned a different record. Reading past the last record returned HTTP 200,
   * `status: 1`, `errors: { code: 7024, message: "No records found" }` and no `result` — see
   * `classifyFormsPage` in envelope.js. `limit` max 200 is documented, not observed. Paging at
   * more than 200 live employees has NOT been observed. (Zoho's parameter table spells it
   * `slIndex`; the request URL, and the live organisation, use `sIndex`.)
   */
  'people.employee.records': {
    method: 'GET',
    path: '/people/api/forms/employee/getRecords',
    envelope: 'forms',
    scopeKey: 'people.forms.read',
    confirmedOn: '2026-09-07',
    confirmedParams: ['sIndex', 'limit'],
    paramsConfirmedOn: '2026-10-14',
  },
  'people.leave.list': {
    method: 'GET',
    path: '/people/api/v3/leave-tracker/leaves',
    envelope: 'v3',
    scopeKey: 'people.leave.read',      // granted on the .com test organisation, 2026-10-13 (scopes.js)
    confirmedOn: '2026-09-07',
    confirmedParams: ['from_date', 'to_date', 'date_format', 'data_select'],
  },
  /**
   * The Booked and Balance report — Zoho's own leave balance, replacing NeuIQ's invented one.
   *
   * Confirmed 2026-10-13 against the .com tenant: `from`/`to` in dd-MMM-yyyy (yyyy-MM-dd returned
   * HTTP 500 — Zoho answers a malformed request with a server error, so this endpoint is never
   * retried on 5xx), `unit=Day`, and `employee` as a JSON array of erecnos (__recordId), which
   * Zoho honoured: the report held only the requested employee.
   *
   * Documented limit: 30 requests, then a two-minute lockout.
   */
  'people.leave.balance': {
    method: 'GET',
    path: '/people/api/v2/leavetracker/reports/bookedAndBalance',
    envelope: 'report',
    scopeKey: 'people.leave.read',
    confirmedOn: '2026-10-13',
    confirmedParams: ['from', 'to', 'unit', 'employee'],
    dateFormat: 'dd-MMM-yyyy',
    retryOn5xx: false,
    rateLimit: { requests: 30, lockoutSeconds: 120 },
  },
  'people.attendance.entries': {
    method: 'GET',
    path: '/people/api/v3/attendance/entries',
    envelope: 'v3',
    scopeKey: 'people.attendance.read',  // still PENDING in scopes.js
    confirmedOn: '2026-09-07',
    confirmedParams: ['employee_email_id', 'from_date', 'to_date', 'date_format'],
  },
};

/**
 * `data_select` on the leave endpoint.
 *
 * `MINE` and `ALL` have both returned 200. The rest appear in Zoho's documentation and have not
 * been tried, so nothing in this codebase sends them.
 *
 * **`ALL` returning 200 is what makes the service-account model viable.** `MINE` is relative to
 * whoever the token belongs to, so under a single service identity it would return the service
 * account's own leave rather than the caller's — useless at best. `ALL` lets one identity read on
 * everyone's behalf, with our policy layer deciding who may see what.
 */
export const LEAVE_DATA_SELECT = {
  confirmed: ['MINE', 'ALL'],
  documented: ['SUBORDINATES', 'DIRECT_SUBORDINATES', 'MINE,SUBORDINATES'],
};

/**
 * Documented parameters that have NOT been exercised. Listed so they are not rediscovered, and
 * kept out of the confirmed lists so nothing sends them by accident.
 *
 * `employee_zoho_ids` is the significant one. It would let us narrow a read server-side to
 * specific employees — defence in depth on top of our own filter — but until it is confirmed,
 * see the warning on `dataSelectFor` below.
 */
export const DOCUMENTED_UNTRIED = {
  'people.leave.list': [
    'employee_zoho_ids', 'employee_department_ids', 'employee_location_ids', 'employee_status',
    'leave_type_ids', 'type_of_leave', 'approval_status', 'offset', 'limit', 'sort',
  ],
};

/**
 * The `data_select` value to send for a caller.
 *
 * ## Read this before changing it
 *
 * Every role currently gets `ALL`, and that is not a shortcut — it is the only confirmed value
 * that works under a service account. `MINE` would resolve to the service identity, not the
 * caller.
 *
 * **The consequence is that Zoho applies no narrowing, so our read-time scoping in
 * core/policy/scope.js is the ONLY thing standing between an employee and the whole
 * organisation's leave.** That was always true of the design, but with `ALL` there is no second
 * fence behind it.
 *
 * Two things follow, and neither is optional once this is wired to live data:
 *
 *  1. The post-query row assertion — verify every returned row's employeeId is within the
 *     caller's allowed set — stops being a nice-to-have. It converts a scoping bug from a silent
 *     data leak into a 500 with a log line.
 *  2. Confirming `employee_zoho_ids` should be treated as security work, not an optimisation. It
 *     restores the second fence.
 */
export function dataSelectFor(_user) {
  return 'ALL';
}

/** Look up a confirmed endpoint. Throws for anything unrecorded rather than guessing a path. */
export function endpoint(key) {
  const found = CONFIRMED_ENDPOINTS[key];
  if (!found) {
    throw new Error(
      `zoho people: no confirmed endpoint "${key}". Known: ${Object.keys(CONFIRMED_ENDPOINTS).join(', ')}`,
    );
  }
  return found;
}
