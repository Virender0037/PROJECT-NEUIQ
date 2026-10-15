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
 *   in    People host reached by `curl` on 2026-09-07 (employee, leave, attendance). No token has
 *         been minted through this code against `accounts.zoho.in`, so that host stays unverified.
 *   com   Reached THROUGH THIS CODE on 2026-10-13 and 2026-10-14: tokens minted on
 *         `accounts.zoho.com` (response `api_domain` https://www.zohoapis.com), and `people.zoho.com`
 *         answered the employee, leave and Booked-and-Balance endpoints. This is the approved
 *         development/test organisation — NOT a confirmed production organisation.
 *
 * Every other entry is the documented host pattern and is marked `unverified`. They are listed so
 * a future DC is a data change rather than a code change — not because anyone has called them.
 *
 * A confirmed DC says which REGION answered. It says nothing about which ORGANISATION: nothing in
 * this code, and nothing in Zoho's documented token or People APIs, identifies the organisation.
 *
 * ## No default
 *
 * There used to be a `DEFAULT_DC = 'in'` that an unset `ZOHO_DC` silently fell back to. It is gone:
 * live Zoho needs `ZOHO_DC` set explicitly (`resolveZohoDc` below), and every function here takes
 * the code as a required argument, so nothing can quietly point at another country's tenant.
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
    apiDomain: 'https://www.zohoapis.in',   // the token response's api_domain must equal this
    apiDomainStatus: UNVERIFIED,           // documented pattern; never returned to this code
    label: 'India',
    accounts: 'https://accounts.zoho.in',
    accountsStatus: UNVERIFIED,       // no token minted through this code on .in
    apiHosts: { people: 'https://people.zoho.in' },
    status: CONFIRMED,                // people host returned 200 on 2026-09-07 (curl)
  },
  com: {
    code: 'com',
    apiDomain: 'https://www.zohoapis.com',  // the token response's api_domain must equal this
    apiDomainStatus: CONFIRMED,            // returned by the .com token endpoint, 2026-10-13/14
    label: 'United States / global',
    accounts: 'https://accounts.zoho.com',
    accountsStatus: CONFIRMED,        // tokens minted through this code, 2026-10-13 and 2026-10-14
    apiHosts: { people: 'https://people.zoho.com' },
    status: CONFIRMED,                // people host answered through this code, 2026-10-13/14 (test organisation)
  },
  eu: {
    code: 'eu',
    apiDomain: 'https://www.zohoapis.eu',   // the token response's api_domain must equal this
    apiDomainStatus: UNVERIFIED,           // documented pattern; never returned to this code
    label: 'Europe',
    accounts: 'https://accounts.zoho.eu',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.eu' },
    status: UNVERIFIED,
  },
  au: {
    code: 'au',
    apiDomain: 'https://www.zohoapis.com.au',// the token response's api_domain must equal this
    apiDomainStatus: UNVERIFIED,           // documented pattern; never returned to this code
    label: 'Australia',
    accounts: 'https://accounts.zoho.com.au',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.com.au' },
    status: UNVERIFIED,
  },
  jp: {
    code: 'jp',
    apiDomain: 'https://www.zohoapis.jp',   // the token response's api_domain must equal this
    apiDomainStatus: UNVERIFIED,           // documented pattern; never returned to this code
    label: 'Japan',
    accounts: 'https://accounts.zoho.jp',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.jp' },
    status: UNVERIFIED,
  },
  ca: {
    code: 'ca',
    apiDomain: 'https://www.zohoapis.ca',   // the token response's api_domain must equal this
    apiDomainStatus: UNVERIFIED,           // documented pattern; never returned to this code
    label: 'Canada',
    accounts: 'https://accounts.zohocloud.ca',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zohocloud.ca' },
    status: UNVERIFIED,
  },
  sa: {
    code: 'sa',
    apiDomain: 'https://www.zohoapis.sa',   // the token response's api_domain must equal this
    apiDomainStatus: UNVERIFIED,           // documented pattern; never returned to this code
    label: 'Saudi Arabia',
    accounts: 'https://accounts.zoho.sa',
    accountsStatus: UNVERIFIED,
    apiHosts: { people: 'https://people.zoho.sa' },
    status: UNVERIFIED,
  },
};

/**
 * Resolve a DC by code. The code is REQUIRED.
 *
 * A missing or unknown code throws rather than falling back to anything: silently using the wrong
 * data centre is the exact failure this module exists to prevent, and a typo in a deployment
 * variable should stop the process, not quietly point it at another country's tenant. The value
 * is clipped in the message, in case a credential was pasted into the wrong variable.
 */
export function dataCentre(code) {
  const key = String(code ?? '').trim().toLowerCase();
  if (!key) throw new Error('zoho: no data centre given. Set ZOHO_DC explicitly — there is no default.');
  const dc = DATA_CENTRES[key];
  if (!dc) {
    throw new Error(
      `zoho: unknown data centre ${JSON.stringify(String(code).slice(0, 8))}. Known: ${Object.keys(DATA_CENTRES).join(', ')}`,
    );
  }
  return dc;
}

/**
 * The data centre for live Zoho, from `ZOHO_DC` — required, never defaulted (S2).
 *
 * One rule, used by every entry point: the startup environment profile (server.js and
 * createApp()) and the People manifest. Throws a sanitised error for a missing or unknown value.
 */
export function resolveZohoDc(env = process.env) {
  const raw = env.ZOHO_DC;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    throw new Error(
      `zoho: ZOHO_DC is required when NEUIQ_DATA_SOURCE=zoho — there is no default. Known: ${Object.keys(DATA_CENTRES).join(', ')}.`,
    );
  }
  return dataCentre(raw);
}

/**
 * The API base for one product in one DC.
 *
 * A product with no recorded host throws. That is deliberate — returning a plausible guess like
 * `https://<product>.zoho.in` would produce requests that fail in ways that look like auth or
 * permission problems.
 */
export function apiBase(product, code) {
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
export function accountsBase(code) {
  return dataCentre(code).accounts;
}

/**
 * The `api_domain` a token minted for this DC must carry — the OAuth domain allow-list (E2.2).
 *
 * Zoho's token response names the API domain the token belongs to. A token whose domain is not
 * exactly this one was minted for another data centre (or by something that is not Zoho's .com
 * accounts server) and is refused before it is cached or used. Only `com` has been observed.
 */
export const expectedApiDomain = (code) => dataCentre(code).apiDomain;

/** True when this DC has actually been reached, rather than being a documented pattern. */
export const isConfirmed = (code) => dataCentre(code).status === CONFIRMED;
