/**
 * The deployment's environment profile — resolved once at boot, frozen, never changed by a request.
 *
 * E2.2A-1. One validated object answers "what is this process?": which environment it is, which
 * data source and sign-in mode it runs, whether a real signing secret protects it, and what each
 * integration requires (a Zoho data centre, today). Every entry point resolves it through THIS
 * function — server.js before it loads the app, createApp() for every app built — so no path can
 * start with a combination another path would refuse.
 *
 * ## Environments
 *
 *   dev    seed data. Demo sign-in allowed (the account picker, no password); zoho sign-in mode
 *          allowed too, and then a real AUTH_SECRET is required. NEUIQ_ENV unset means dev — but
 *          only over seed data and outside production.
 *   test   live Zoho, the approved development/test organisation. NEUIQ_DATA_SOURCE=zoho,
 *          NEUIQ_AUTH_MODE=zoho, a real AUTH_SECRET, ZOHO_DC set. Not NODE_ENV=production.
 *   prod   live Zoho with NODE_ENV=production — and NODE_ENV=production means prod, nothing else.
 *
 * ## Order of checks, and why
 *
 *   1. sign-in mode   core/auth/mode.js, unchanged (E1) — its refusals and messages come first
 *   2. environment    NEUIQ_ENV against the data source and NODE_ENV
 *   3. integrations   each integration's own requirement (ZOHO_DC for live Zoho People)
 *   4. signing secret required whenever the secret could protect non-demo sign-in (S7)
 *
 *   5. deployment    the namespace every cache, store and session is partitioned by (E2.2)
 *
 * ## The deployment namespace
 *
 *   dev    `dev/seed`
 *   live   `<environment>/<integration partition>/<NEUIQ_ORG_KEY>`, e.g. `test/zoho-com/acme-test`
 *
 * NEUIQ_ORG_KEY is an operator-assigned label for the Zoho organisation a live deployment serves —
 * REQUIRED for test and prod, lower-case letters, digits and hyphens. It partitions; it does not
 * verify. Distinct environments and organisations get distinct namespaces, so their cached data,
 * stored dashboards and (later) sessions can never be read across.
 *
 * ## What this does NOT establish
 *
 * Which Zoho ORGANISATION the credentials really belong to. A verified data centre names a region,
 * not a company; nothing here, and nothing in Zoho's documented token or People APIs, identifies
 * the organisation. `organisationVerification` is therefore always 'unresolved' for live data —
 * never true, and nothing may grant access on the assumption that it is.
 *
 * Imports nothing outside core, so every branch is testable without touching process.env.
 */
import { resolveAuthMode } from '../auth/mode.js';
import { signingSecretProblem, MIN_SIGNING_SECRET_LENGTH } from '../auth/session.js';

export const ENV_DEV = 'dev';
export const ENV_TEST = 'test';
export const ENV_PROD = 'prod';
export const ENVIRONMENTS = Object.freeze([ENV_DEV, ENV_TEST, ENV_PROD]);

const refuse = (message) => new Error(`environment: refusing to start. ${message}`);

/** Values are configuration, not secrets — but clipped, in case a credential landed in the wrong variable. */
const clip = (raw) => JSON.stringify(String(raw).slice(0, 16));

const SECRET_MESSAGES = {
  missing: 'AUTH_SECRET is not set.',
  'demo-default': 'AUTH_SECRET is the public demo value.',
  'too-short': `AUTH_SECRET is shorter than ${MIN_SIGNING_SECRET_LENGTH} characters.`,
  placeholder: 'AUTH_SECRET looks like a placeholder copied from an example.',
  predictable: 'AUTH_SECRET has too few distinct characters to be random.',
};

/**
 * NEUIQ_ENV against the data source and NODE_ENV.
 *
 * `dataSource` is the PUBLIC value ('seed' | 'zoho' | null); anything but an explicit 'seed' is
 * treated as live, as core/auth/mode.js does.
 */
function resolveEnvironmentName(env, { dataSource, production }) {
  const raw = env.NEUIQ_ENV;
  const given = raw === undefined || raw === null ? '' : String(raw).trim().toLowerCase();
  const seedData = dataSource === 'seed';

  if (given && !ENVIRONMENTS.includes(given)) {
    throw refuse(`NEUIQ_ENV must be one of ${ENVIRONMENTS.join(' | ')}, got ${clip(raw)}.`);
  }
  if (!given) {
    if (production) throw refuse('NODE_ENV=production requires NEUIQ_ENV=prod.');
    if (!seedData) throw refuse('NEUIQ_ENV is unset and the data source is not seed. Set NEUIQ_ENV=test (or prod).');
    return ENV_DEV;
  }
  if (given === ENV_PROD && !production) throw refuse('NEUIQ_ENV=prod requires NODE_ENV=production.');
  if (production && given !== ENV_PROD) throw refuse(`NODE_ENV=production requires NEUIQ_ENV=prod, got ${clip(raw)}.`);
  if (given === ENV_DEV && !seedData) throw refuse('NEUIQ_ENV=dev runs on seed data only. Use NEUIQ_ENV=test for the live Zoho test organisation.');
  if ((given === ENV_TEST || given === ENV_PROD) && dataSource !== 'zoho') {
    throw refuse(`NEUIQ_ENV=${given} requires NEUIQ_DATA_SOURCE=zoho.`);
  }
  return given;
}

/**
 * Resolve, validate and freeze the profile. Throws a sanitised error for every refused combination.
 *
 * @param env                the environment variables (process.env, or a test's object)
 * @param dataSource         the PUBLIC data source already resolved ('seed' | 'zoho' | null)
 * @param integrationChecks  `(env, { dataSource, environment, production }) => object` — each may
 *                           throw to refuse; what it returns is frozen into `integrations`
 */
export function resolveEnvironmentProfile(env = process.env, { dataSource = null, integrationChecks = [] } = {}) {
  const production = String(env.NODE_ENV || '').trim().toLowerCase() === 'production';

  // 1. Sign-in mode first, so its existing refusals keep their exact messages.
  const auth = resolveAuthMode(env, { dataSource });

  // 2. The environment label.
  const environment = resolveEnvironmentName(env, { dataSource, production });
  // Unreachable through the rules above (demo needs seed; only dev runs on seed) — stated anyway,
  // because it is the one combination that must never exist.
  if (auth.isDemo && environment !== ENV_DEV) throw refuse('demo sign-in is only allowed in dev.');

  // 3. What each integration needs.
  const integrations = {};
  for (const check of integrationChecks) {
    Object.assign(integrations, check(env, { dataSource, environment, production }) || {});
  }

  // 4. The signing secret: required wherever it could protect anything but demo sign-in.
  const secretRequired = !auth.isDemo || production || environment !== ENV_DEV;
  const problem = signingSecretProblem(env.AUTH_SECRET);
  if (secretRequired && problem) {
    throw refuse(`${SECRET_MESSAGES[problem]} A real AUTH_SECRET (${MIN_SIGNING_SECRET_LENGTH}+ random characters) is required outside demo sign-in — see backend/.env.example.`);
  }

  // 5. Organisation-specific settings that have no implementation yet are refused, not ignored:
  // an HR-admin list set today would look as though it worked, and could be copied into another
  // organisation's deployment. E3 will bind it to the deployment namespace.
  const premature = Object.keys(env).filter((k) => /^NEUIQ_HR_ADMIN/i.test(k) && String(env[k] ?? '').trim());
  if (premature.length) {
    throw refuse(`${premature.join(', ')} is not supported until E3 (roles); remove it. It will be bound to the deployment namespace then.`);
  }

  // 6. The deployment namespace — the partition key for every cache, store and session.
  const live = dataSource === 'zoho';
  let orgKey = null;
  if (live) {
    const raw = env.NEUIQ_ORG_KEY;
    orgKey = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!orgKey) {
      throw refuse(`NEUIQ_ORG_KEY is required for NEUIQ_ENV=${environment}: a label for the Zoho organisation this deployment serves (e.g. acme-test), distinct per organisation and environment.`);
    }
    if (!ORG_KEY.test(orgKey)) {
      throw refuse(`NEUIQ_ORG_KEY must be 3–40 lower-case letters, digits and hyphens, got ${clip(raw)}.`);
    }
  }
  const partition = integrations.partition ?? (live ? null : 'seed');
  if (!partition) throw refuse('the live integration did not declare a deployment partition.');
  const namespace = live ? `${environment}/${partition}/${orgKey}` : `${environment}/${partition}`;

  return Object.freeze({
    environment,
    production,
    dataSource,
    auth: Object.freeze({ ...auth }),
    // 'required' — a valid secret was demanded and found. 'demo' — demo sign-in, where the public
    // fallback is tolerated. Never the value, never its length.
    signingSecret: secretRequired ? 'required' : 'demo',
    integrations: Object.freeze({ ...integrations }),
    orgKey,
    namespace,
    // Never 'verified': no documented Zoho token claim or People API identifies an organisation,
    // and an employee record that happens to exist is not proof. See docs/backend/17-environment-isolation.md.
    organisationVerification: live ? 'unresolved' : 'not-applicable',
  });
}

/** An operator-chosen organisation label: 3–40 chars, lower-case, digits, inner hyphens. */
const ORG_KEY = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** For the startup log line. Names the environment plainly; carries no configuration values. */
export function describeEnvironment(profile) {
  const what = {
    [ENV_DEV]: 'dev — seed data',
    [ENV_TEST]: 'test — live Zoho test organisation (organisation identity NOT verified)',
    [ENV_PROD]: 'prod — live Zoho (organisation identity NOT verified)',
  }[profile.environment];
  return `${what}; namespace ${profile.namespace}; signing secret: ${profile.signingSecret === 'required' ? 'required, set' : 'demo fallback allowed'}`;
}
