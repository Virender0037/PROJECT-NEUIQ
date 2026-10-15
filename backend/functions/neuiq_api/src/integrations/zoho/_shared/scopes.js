/**
 * OAuth scopes, split by whether we have actually seen them work.
 *
 * Scope names are the one part of a Zoho integration that cannot be reasoned out. They vary by
 * product, by API version and by casing — the employee form needs `ZOHOPEOPLE.forms.READ`
 * (upper-case product, no camel case), which is not what the general documentation pattern would
 * lead you to write. An earlier draft of this project guessed `ZohoPeople.employee.READ` and
 * `ZohoPeople.leave.READ`. Both were wrong.
 *
 * So this file records evidence, not intent:
 *
 *   CONFIRMED_SCOPES  a request was made with this scope and returned 200
 *   PENDING_SCOPES    the endpoint works, but which scope authorised it was not recorded
 *
 * A pending scope has `scope: null` and **`scopeFor()` throws** rather than returning a guess.
 * Over-requesting scopes is not a harmless default: an HR integration asking for more access than
 * it uses is the kind of thing a client security review stops, and a scope string invented here
 * would end up in a consent screen shown to the customer.
 */

/** Scopes observed working. */
export const CONFIRMED_SCOPES = {
  'people.forms.read': {
    scope: 'ZOHOPEOPLE.forms.READ',
    product: 'people',
    confirmedOn: '2026-09-07',
    endpoint: 'GET /people/api/forms/employee/getRecords',
    note: 'Employee form records. 200 OK on the India DC (2026-09-07, curl), and granted and used '
      + 'on the .com test organisation through this code (2026-10-13/14).',
  },
  /**
   * Recorded 2026-10-13 against the .com test organisation, through this code: the token
   * response's granted `scope` listed exactly ZOHOPEOPLE.forms.READ and ZOHOPEOPLE.leave.READ, and
   * the leave list and Booked-and-Balance report answered 200 with that token. Observed on the
   * test organisation only — re-confirm on the production organisation's own credentials.
   */
  'people.leave.read': {
    scope: 'ZOHOPEOPLE.leave.READ',
    product: 'people',
    confirmedOn: '2026-10-13',
    endpoint: 'GET /people/api/v3/leave-tracker/leaves',
    note: 'Granted on the .com test organisation token; leave list and Booked and Balance report 200.',
  },
};

/**
 * Endpoints that returned 200 but whose authorising scope was not captured.
 *
 * Attendance answered 200 on 2026-09-07 (India, curl), but which scope authorised it was never
 * recorded, and the .com test token was not granted any attendance scope. Until that is
 * separated, requesting a name for it would be a guess with a consent screen attached.
 */
export const PENDING_SCOPES = {
  'people.attendance.read': {
    scope: null,
    product: 'people',
    endpoint: 'GET /people/api/v3/attendance/entries',
    note: 'Endpoint confirmed 200. Authorising scope not recorded — verify in the API console.',
  },
};

/**
 * Look up a scope string by key.
 *
 * Throws for a pending key, and throws for an unknown one. There is no third outcome and no
 * default — a caller that gets a string back can rely on it having been observed.
 */
export function scopeFor(key) {
  const confirmed = CONFIRMED_SCOPES[key];
  if (confirmed) return confirmed.scope;

  const pending = PENDING_SCOPES[key];
  if (pending) {
    throw new Error(
      `zoho: scope for "${key}" is not confirmed yet (${pending.endpoint}). ` +
      'Record the authorising scope from the API console before requesting it.',
    );
  }

  throw new Error(`zoho: unknown scope key "${key}"`);
}

/**
 * The scope string to send on an authorisation request: confirmed entries only.
 *
 * Deliberately not "everything we might eventually need". An OAuth grant is requested once and
 * shown to the customer; it should list what we have demonstrated we use.
 */
export function requestedScopes() {
  return Object.values(CONFIRMED_SCOPES).map((s) => s.scope);
}

/** Formatted for the `scope` parameter of an authorisation URL. */
export const scopeParam = () => requestedScopes().join(',');

/** True when a key has an observed scope behind it. */
export const isConfirmedScope = (key) => Boolean(CONFIRMED_SCOPES[key]);
