/**
 * Zoho data centres.
 *
 * **The trap this file exists to close:** a token minted on `accounts.zoho.in` will not work
 * against `.com` endpoints. It fails as a confusing 401 loop rather than as anything that names
 * the real problem, so the DC is structural here — one setting drives every host, and the token
 * cache is keyed by it (see auth.service.js) so a misconfiguration surfaces as a clean auth error
 * instead of a mystery.
 *
 * ## Confirmation status
 *
 * `in` is the only DC this project has actually reached. `people.zoho.in` returned 200 for the
 * employee, leave and attendance endpoints on 2026-09-07.
 *
 * Every other entry is the documented host pattern and is marked `unverified`. They are listed so
 * the shape is ready and so a future DC is a data change rather than a code change — not because
 * anyone has called them. Selecting one warns rather than throws: blocking a colleague from
 * trying the EU DC would be worse than letting them find out it works.
 *
 * `accounts` for `in` is also marked unverified: the People API host is confirmed, but no OAuth
 * call has been made yet, so the accounts host is the documented pattern rather than an observed
 * fact. It flips to confirmed the first time a token is minted.
 */

/** What we have actually observed, versus what is the documented pattern. */
export const CONFIRMED = 'confirmed';
export const UNVERIFIED = 'unverified';

/**
 * One entry per data centre.
 *
 * `apiHosts` lists only products whose host we have evidence for. Zoho does not use one host for
 * everything — People answers on `people.zoho.<suffix>` while most other products answer on
 * `www.zohoapis.<suffix>` — so guessing a host for CRM or Desk here would be inventing API
 * behaviour. They get added when a product is actually reached.
 */
export const DATA_CENTRES = {
  in: {
    code: 'in',
    label: 'India',
    accounts: 'https://accounts.zoho.in',
    accountsStatus: UNVERIFIED,       // no OAuth call made yet
    apiHosts: { people: 'https://people.zoho.in' },
    status: CONFIRMED,                // people host returned 200 on 2026-09-07
  },
  com: {
    code: 'com',
    label: 'United States / global',
    accounts: 'https://accounts.zoho.com',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.com' },
    status: UNVERIFIED,
  },
  eu: {
    code: 'eu',
    label: 'Europe',
    accounts: 'https://accounts.zoho.eu',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.eu' },
    status: UNVERIFIED,
  },
  au: {
    code: 'au',
    label: 'Australia',
    accounts: 'https://accounts.zoho.com.au',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.com.au' },
    status: UNVERIFIED,
  },
  jp: {
    code: 'jp',
    label: 'Japan',
    accounts: 'https://accounts.zoho.jp',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.jp' },
    status: UNVERIFIED,
  },
  ca: {
    code: 'ca',
    label: 'Canada',
    accounts: 'https://accounts.zohocloud.ca',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zohocloud.ca' },
    status: UNVERIFIED,
  },
  sa: {
    code: 'sa',
    label: 'Saudi Arabia',
    accounts: 'https://accounts.zoho.sa',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.sa' },
    status: UNVERIFIED,
  },
};

/** The one we have actually reached. Used when nothing is configured. */
export const DEFAULT_DC = 'in';

/**
 * Resolve a DC by code.
 *
 * An unknown code throws rather than falling back to India: silently using the wrong data centre
 * is the exact failure this module exists to prevent, and a typo in a deployment variable should
 * stop the process, not quietly point it at another country's tenant.
 */
export function dataCentre(code = DEFAULT_DC) {
  const key = String(code || '').trim().toLowerCase();
  const dc = DATA_CENTRES[key];
  if (!dc) {
    throw new Error(
      `zoho: unknown data centre "${code}". Known: ${Object.keys(DATA_CENTRES).join(', ')}`,
    );
  }
  return dc;
}

/**
 * The API base for one product in one DC.
 *
 * A product with no recorded host throws. That is deliberate — returning a plausible guess like
 * `https://<product>.zoho.in` would produce requests that fail in ways that look like auth or
 * permission problems.
 */
export function apiBase(product, code = DEFAULT_DC) {
  const dc = dataCentre(code);
  const host = dc.apiHosts?.[product];
  if (!host) {
    throw new Error(
      `zoho: no confirmed API host for product "${product}" in DC "${dc.code}". ` +
      'Add it to DATA_CENTRES once an endpoint has actually been reached.',
    );
  }
  return host;
}

/** The OAuth accounts base for a DC. Token minting and refresh both go here. */
export function accountsBase(code = DEFAULT_DC) {
  return dataCentre(code).accounts;
}

/** True when this DC has actually been reached, rather than being a documented pattern. */
export const isConfirmed = (code = DEFAULT_DC) => dataCentre(code).status === CONFIRMED;
