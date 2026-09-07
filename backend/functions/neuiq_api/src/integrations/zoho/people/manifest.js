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
import { resolveDataSource } from './dataSource.js';
import { configFromEnv, createTokenProvider, isConfigured } from '../_shared/auth.service.js';
import { createPeopleClient } from './client.js';
import { buildLiveSources } from './sources.live.js';
import { buildLiveTools } from './tools/live.js';

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
    tools: buildLiveTools({ client }),
    directory: liveDirectory,
    client,
    tokenProvider,
  };
}

/**
 * The directory in live mode, with the reporting hierarchy switched OFF.
 *
 * No manager or reporting field appeared in the captured employee payload, so there is nothing to
 * build a manager -> direct-reports relationship from. The seed HAS such a relationship, and
 * leaving it wired up in live mode would be the worst of both: `resolveSubject` would let a
 * manager read a "direct report" chosen by generated demo data that has no connection to the real
 * org chart. That is an authorization decision made from fabricated input.
 *
 * So `byId` returns null. `resolveSubject` then finds no subject to match against and throws 403 —
 * it fails CLOSED. Reading yourself still works, and an admin still reads anyone, because both of
 * those paths return before the directory is consulted. What is refused is exactly the case that
 * cannot currently be decided correctly.
 *
 * This is restored by confirming a reporting field on the employee form, not by writing code.
 */
const liveDirectory = {
  ...directory,
  byId: () => null,
  hierarchyAvailable: false,
};

/** The manifest for this process. */
export default buildPeopleManifest();
