/**
 * The Zoho People integration manifest.
 *
 * One object declaring everything this product contributes to the core: its tools, its query
 * sources, and its employee directory. Core imports none of it — the composition root in
 * integrations/registry.js reads this and registers the parts.
 *
 * ## Seed or live is decided here, once, at boot
 *
 * `NEUIQ_DATA_SOURCE` selects which set of sources and tools gets registered. The two sets share
 * their contract exactly — same source keys, same tool names, same scopes, same `say()` — so
 * nothing above this file knows which is active. There is no request-time branch and no fallback:
 * a Zoho failure surfaces as an error, never as seed data. See people/dataSource.js.
 *
 * Fields later phases will add: `health` (reachability for /health), `widgets` and `keywords`
 * (moving the last People vocabulary out of core).
 */
import { PEOPLE_SOURCES } from './sources.js';
import { PEOPLE_TOOLS } from './tools/index.js';
import { directory } from './directory.js';
import { resolveDataSource, publicDataSource } from './dataSource.js';
import { configFromEnv, createTokenProvider, isConfigured } from '../_shared/auth.service.js';
import { createPeopleClient } from './client.js';
import { buildLiveSources } from './sources.live.js';
import { buildLiveTools } from './tools/live.js';
import { createEmployeeDirectory } from './employeeDirectory.js';

/**
 * Build the manifest for the configured data source.
 *
 * Takes the environment so the choice is testable without setting process-wide state.
 */
export function buildPeopleManifest(env = process.env) {
  const resolved = resolveDataSource(env);

  const base = {
    key: 'zoho.people',
    vendor: 'zoho',
    product: 'people',
    label: 'Zoho People',
    dataSource: resolved.source,
    // 'seed' | 'zoho' | null, from the SAME resolution that chose the sources and tools below —
    // what /health and /me report, so the UI never has to infer it from reachability.
    publicDataSource: publicDataSource(resolved),
    directory,
  };

  if (resolved.isSeed) {
    return { ...base, sources: PEOPLE_SOURCES, tools: PEOPLE_TOOLS, client: null };
  }

  const config = configFromEnv(env);
  if (!isConfigured(config)) {
    // Refuse at boot rather than on the first request. A server that starts and then fails every
    // question is harder to diagnose than one that says why it would not start.
    throw new Error(
      'zoho.people: NEUIQ_DATA_SOURCE=zoho but OAuth is not configured. '
      + 'Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN — see backend/.env.example.',
    );
  }

  const tokenProvider = createTokenProvider({ config });
  const client = createPeopleClient({ dc: config.dc, tokenProvider });

  return {
    ...base,
    sources: buildLiveSources({ client }),
    // The leave-year start is read here, at boot, like everything else that decides live
    // behaviour. Unset is allowed: leaveBalance then refuses as unavailable rather than guessing.
    tools: buildLiveTools({ client, leaveYearStart: env.ZOHO_PEOPLE_LEAVE_YEAR_START }),
    directory: liveDirectory,
    // Built and cached here, CONNECTED TO NOTHING YET: identity mapping and roles use it from
    // E3/E5. Loads through the same service-account client as every other live read.
    employeeDirectory: createEmployeeDirectory({
      loadRecords: () => client.employees(),
      logger: {
        info: (o) => console.log(JSON.stringify(o)),
        warn: (o) => console.warn(JSON.stringify(o)),
      },
    }),
    client,
    tokenProvider,
  };
}

/**
 * The synchronous directory interface in live mode — and NOTHING from the seed.
 *
 * This used to be `{ ...directory, byId, reportsOf }`: a spread of the SEED directory with two
 * methods overridden. Every method not overridden — `resolve` (who a token belongs to),
 * `byUsername`, `demoAccounts`, `count` — was still the seed's, so a seed identity could have been
 * resolved against live Zoho data. (Phase 5.3 removed the spread.)
 *
 * Every member is now explicit, and every identity question is REFUSED: there is no live sign-in
 * yet (Phase 5 E5), and the Phase 5.2 gate refuses every token in zoho mode anyway. The real
 * answers come from the async employee directory (employeeDirectory.js), attached to the manifest
 * below as `employeeDirectory` and wired into identity and authorization in E3/E5 — not here.
 *
 *   resolve      -> null   a token resolves to nobody (401)
 *   byId         -> null   no subject, so resolveSubject refuses team reads (403)
 *   reportsOf    -> []     and the hierarchy is off, so authorize.js never reads it
 *   count        -> null   no headcount from here (the summary shows it as unavailable)
 */
const liveDirectory = Object.freeze({
  resolve: () => null,
  byUsername: () => null,
  demoAccounts: () => [],
  byId: () => null,
  reportsOf: () => [],
  count: () => null,
  hierarchyAvailable: false,
});

/** The manifest for this process. */
export default buildPeopleManifest();
