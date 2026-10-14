/**
 * Where the figures on screen come from — stated from what the backend REPORTS, never inferred.
 *
 * ## The mistake this replaces
 *
 * Settings used to say "Live from the API" whenever the backend answered, and several screens
 * said answers came from "live Zoho People data". But a reachable backend is not a live one: it
 * serves generated demo records whenever NEUIQ_DATA_SOURCE=seed, and nothing on screen said so.
 * The backend now reports `dataSource` ('seed' | 'zoho' | null) on /health and /me, and every
 * statement about provenance is derived here from that — one place, so Classic and Hybrid cannot
 * disagree and no screen can drift back to assuming.
 *
 * ## Five states, one order of precedence
 *
 *   offline   the API cannot be reached; anything shown is a local sample   (wins over all)
 *   pending   not heard back yet; claim nothing, warn about nothing
 *   seed      the backend says demo data                                    -> banner
 *   zoho      the backend says live Zoho People                             -> the only "live"
 *   unknown   the backend answered without a recognisable source           -> "Data source unavailable"
 *
 * "live" is said in exactly one case: the backend reported 'zoho' and the API is reachable.
 *
 * Imports nothing, so it can be asserted under plain `node`.
 */

export const SOURCE_KIND = Object.freeze({
  OFFLINE: 'offline',
  PENDING: 'pending',
  SEED: 'seed',
  ZOHO: 'zoho',
  UNKNOWN: 'unknown',
});

/**
 * The backend's value -> 'seed' | 'zoho' | null. Exact, lower-case words only: a reported "Zoho",
 * "live", true or 1 is not evidence of live data, so it is unknown.
 *
 * `undefined` is kept as undefined — "not heard yet" — which is different from null, "heard, and
 * it was nothing we recognise".
 */
export function normaliseDataSource(value) {
  if (value === undefined) return undefined;
  return value === 'seed' || value === 'zoho' ? value : null;
}

export function sourceKind({ dataSource, offline = false } = {}) {
  if (offline) return SOURCE_KIND.OFFLINE;
  const ds = normaliseDataSource(dataSource);
  if (ds === undefined) return SOURCE_KIND.PENDING;
  if (ds === 'seed') return SOURCE_KIND.SEED;
  if (ds === 'zoho') return SOURCE_KIND.ZOHO;
  return SOURCE_KIND.UNKNOWN;
}

const COPY = {
  // Phase 4: nothing is substituted when the API is down — no sample charts, no canned replies,
  // no local sign-in — so this says only that nothing can be loaded, sent or saved.
  [SOURCE_KIND.OFFLINE]: {
    banner: 'API unavailable — cannot connect to the server. Nothing can be loaded or saved.',
    settings: { value: 'API unavailable', hint: 'The API cannot be reached. No data is shown in its place, and changes cannot be saved.', warn: true },
    answers: 'The API is unavailable, so questions cannot be answered until it reconnects.',
    builds: 'The API is unavailable, so dashboards cannot be built until it reconnects.',
  },
  [SOURCE_KIND.PENDING]: {
    banner: null,
    settings: { value: 'Checking…', hint: 'Waiting for the API to report its data source.', warn: false },
    answers: 'Verify anything you act on.',
    builds: 'Describe what you want to see. It is scoped to what your account may read.',
  },
  [SOURCE_KIND.SEED]: {
    banner: 'Demo data — not live Zoho People data',
    settings: { value: 'Demo data', hint: 'The backend is serving generated demo records (seed), not Zoho People data.', warn: true },
    answers: 'NeuIQ is answering from demo data, not live Zoho People data.',
    builds: 'Describe what you want to see. It is built from demo data — not live Zoho People data — scoped to you.',
  },
  [SOURCE_KIND.ZOHO]: {
    banner: null,
    settings: { value: 'Live Zoho People', hint: 'Every figure is re-fetched from Zoho People and re-scoped when you open a screen.', warn: false },
    answers: 'NeuIQ answers from live Zoho People data. Verify anything you act on.',
    builds: 'Describe what you want to see. It is built from your live Zoho People data, scoped to you.',
  },
  [SOURCE_KIND.UNKNOWN]: {
    banner: 'Data source unavailable',
    settings: { value: 'Data source unavailable', hint: 'The API did not report where its data comes from, so it is not shown as live.', warn: true },
    answers: 'Data source unavailable — answers may not be live Zoho People data. Verify anything you act on.',
    builds: 'Describe what you want to see. The data source is unavailable, so it may not be live Zoho People data.',
  },
};

/**
 * Everything a screen needs to say about provenance.
 *
 * `banner` is null when nothing needs flagging (live, or still checking). `live` is true only for
 * a reported 'zoho' with the API reachable.
 */
export function dataSourceInfo({ dataSource, offline = false } = {}) {
  const kind = sourceKind({ dataSource, offline });
  return { kind, live: kind === SOURCE_KIND.ZOHO, ...COPY[kind] };
}
