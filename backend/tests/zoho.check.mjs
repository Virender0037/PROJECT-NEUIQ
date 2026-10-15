/**
 * Checks for the Zoho integration layer — Phase 2, the confirmed subset.
 *
 *   node tests/zoho.check.mjs
 *
 * Separate from check.mjs so the 65 assertions there stay exactly as they were. No framework:
 * assertions against the real modules, exit 1 on any failure.
 *
 * What is asserted is chosen the same way as in check.mjs — the things that are SECURITY OR
 * CORRECTNESS BOUNDARIES rather than the things that are easy to test:
 *
 *   - a 403 stays a 403 and is never retried or softened
 *   - no error offers a fallback to seed data
 *   - production refuses to boot on the seed
 *   - secrets never survive redaction
 *   - an empty result is a success
 *   - unconfirmed things (scopes, the forms path) REFUSE rather than guess
 *   - dates convert without consulting the runtime locale
 */
import assert from 'node:assert/strict';

import {
  dataCentre, apiBase, accountsBase, isConfirmed, DATA_CENTRES, resolveZohoDc, expectedApiDomain,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/datacenters.js';
import {
  scopeFor, requestedScopes, isConfirmedScope, CONFIRMED_SCOPES, PENDING_SCOPES,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/scopes.js';
import {
  toZohoDate, fromZohoDate, monthKey, dateRangeParams, ZOHO_DATE_FORMAT, MONTHS,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/dates.js';
import {
  unwrapV3, flattenKeyedRecords, unwrapForms, EnvelopeError, FORMS_RESULT_PATH,
  classifyFormsPage, FORMS_NO_RECORDS_CODE,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/envelope.js';
import {
  mapHttpError, mapNetworkError, redact, isRetryable, isRefreshable,
  ZohoAuthError, ZohoForbiddenError, ZohoRateLimitError, ZohoUpstreamError,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/errors.js';
import {
  resolveDataSource, describeDataSource, SEED, ZOHO, zohoPeopleEnvironmentCheck,
} from '../functions/neuiq_api/src/integrations/zoho/people/dataSource.js';
import {
  createTokenProvider, configFromEnv, describeConfig, isConfigured,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/auth.service.js';
import {
  transformLeaveRecord, transformLeaveRecords, transformDayBreakdown,
  CONFIRMED_LEAVE_FIELDS, LEAVE_GAPS,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/leave.js';
import {
  endpoint, dataSelectFor, LEAVE_DATA_SELECT, DOCUMENTED_UNTRIED, CONFIRMED_ENDPOINTS,
} from '../functions/neuiq_api/src/integrations/zoho/people/endpoints.js';
import { createCache, cacheKey, scopedCacheKey } from '../functions/neuiq_api/src/core/platform/cache.js';
import {
  createZohoClient, parseZohoJson, SOURCE_TEXT_SUPPORTED,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/client.js';
import {
  transformEmployeeRecord, transformEmployeeRecords, buildEmailIndex,
  EMPLOYEE_GAPS, ALLOWED_EMPLOYEE_FIELDS, DROPPED_PII_FIELDS,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/employee.js';
import {
  transformAttendanceRecord, transformAttendanceRecords,
  ATTENDANCE_TRANSFORMER_READY, ATTENDANCE_TODO,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/attendance.js';
import { buildLiveSources } from '../functions/neuiq_api/src/integrations/zoho/people/sources.live.js';
import { buildLiveTools, BALANCE_TTL_SECONDS } from '../functions/neuiq_api/src/integrations/zoho/people/tools/live.js';
import {
  transformLeaveBalanceReport, isZohoRecordId, BALANCE_FIELDS, BALANCE_UNAVAILABLE,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/balance.js';
import { leaveBalancePeriod, parseLeaveYearStart } from '../functions/neuiq_api/src/integrations/zoho/people/leaveYear.js';
import { createRateLimiter } from '../functions/neuiq_api/src/integrations/zoho/_shared/rateLimiter.js';
import {
  createPeopleClient, BALANCE_RATE_LIMIT, EMPLOYEE_PAGE_SIZE, DIRECTORY_MAX_PAGES, DIRECTORY_MAX_RECORDS,
  DIRECTORY_PAGE_RATE_LIMIT, PAGINATION,
} from '../functions/neuiq_api/src/integrations/zoho/people/client.js';
import { assertResultAllowed, mayCall } from '../functions/neuiq_api/src/core/tools/registry.js';
import {
  transformEmployeeIdentity, exactId, IDENTITY_FIELDS,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/employeeIdentity.js';
import {
  buildEmployeeIndex, createEmployeeDirectory, LOOKUP, DIRECTORY_MAX_TTL_MS,
  DIRECTORY_FAILURE_COOLDOWN_MS, MAX_DIRECTORY_RECORDS,
} from '../functions/neuiq_api/src/integrations/zoho/people/employeeDirectory.js';
import { readFileSync } from 'node:fs';
import {
  LEAVE_STATUS, normaliseLeaveStatus, isApprovedLeave, matchesLeaveStatus, countWithStatus,
} from '../functions/neuiq_api/src/integrations/zoho/people/leaveStatus.js';
import { LEAVE_STATUSES } from '../functions/neuiq_api/src/integrations/zoho/people/seed.js';
import { buildPeopleManifest } from '../functions/neuiq_api/src/integrations/zoho/people/manifest.js';
import {
  PEOPLE_TOOLS, PERSON_FIELDS, ON_LEAVE_FIELDS,
} from '../functions/neuiq_api/src/integrations/zoho/people/tools/index.js';
import { setDirectory } from '../functions/neuiq_api/src/core/policy/authorize.js';
import { bindDeployment, currentNamespace, boundDeployment } from '../functions/neuiq_api/src/core/platform/deployment.js';
import { createEmployeeSnapshot, EmployeeSnapshotError, SNAPSHOT_FAILURE_COOLDOWN_MS, SNAPSHOT_MAX_TTL_MS, assertSnapshotNamespace } from '../functions/neuiq_api/src/integrations/zoho/people/employeeSnapshot.js';
import { directory as seedDirectory } from '../functions/neuiq_api/src/integrations/zoho/people/directory.js';
import { runQuery, runQueryAsync } from '../functions/neuiq_api/src/core/query/engine.js';
import { SOURCES, registerSources } from '../functions/neuiq_api/src/core/query/sources.js';

// The seed registry must be populated before the engine assertions below run.
import '../functions/neuiq_api/src/integrations/registry.js';

const EMPLOYEE = { employeeId: 'E1001', username: 'alex', role: 'employee' };
const ADMIN = { employeeId: 'E1004', username: 'meera', role: 'hr_admin' };
const MANAGER_LIVE = { employeeId: 'E1003', username: 'rohit', role: 'manager' };

let n = 0;
const ok = (fn, what) => { fn(); n++; console.log('ok  ', what); };
const throws = (fn, what) => { assert.throws(fn); n++; console.log('ok  ', what); };
const rejects = async (fn, what) => { await assert.rejects(fn); n++; console.log('ok  ', what); };

// ---------------------------------------------------------------- deployment binding (E2.2)
// Live components read the deployment namespace AT REQUEST TIME from core/platform/deployment.js.
// Before anything binds one (createApp() does, from the validated profile) every live read is
// refused — proved here, first, because binding is once per process. Then this suite binds the
// synthetic test namespace every later live check runs in.
const TEST_NS = 'test/zoho-com/unit-test';
await (async () => {
  assert.equal(boundDeployment(), null, 'nothing bound yet');
  assert.throws(() => currentNamespace(), (e) => e.code === 'DEPLOYMENT_UNBOUND' && e.status === 503);
  let walked = 0;
  const client = { employees: async () => { walked++; return []; }, leaves: async () => { walked++; return []; } };
  const sources = buildLiveSources({ client });
  const tools = buildLiveTools({ client });
  const admin = { employeeId: 'E9001', role: 'hr_admin' };
  await assert.rejects(() => sources.employees.fetchRows({ user: admin }), (e) => e.status === 503);
  await assert.rejects(() => sources.leave.fetchRows({ user: admin }), (e) => e.code === 'DEPLOYMENT_UNBOUND');
  await assert.rejects(() => tools['zohoPeople.headcount'].run({ groupBy: 'department' }, admin), (e) => e.status === 503);
  assert.equal(walked, 0, 'an unbound process never reaches Zoho');
  n++; console.log('ok   deployment: before a deployment is bound, every live source and tool refuses (503) without a request');
})();
ok(() => {
  bindDeployment({ namespace: TEST_NS, environment: 'test' });
  assert.equal(currentNamespace(), TEST_NS);
  bindDeployment({ namespace: TEST_NS, environment: 'test' });          // same namespace: no-op
  assert.throws(() => bindDeployment({ namespace: 'prod/zoho-com/acme', environment: 'prod' }), /one process serves one deployment/);
  assert.throws(() => bindDeployment({ namespace: 'dev/seed', environment: 'dev' }), /one process serves one deployment/);
  assert.equal(currentNamespace(), TEST_NS, 'a refused rebind changes nothing');
}, 'deployment: one process binds one namespace — rebinding to another (prod, or dev) is refused');

// ---------------------------------------------------------------- data centres
// CHANGED in E2.2A-1 (S2): there is no default data centre any more. This asserted India was it.
throws(() => dataCentre(), 'dc: no code is refused — there is no default to fall back to');
throws(() => dataCentre(''), 'dc: a blank code is refused');
throws(() => apiBase('people'), 'dc: apiBase without a code is refused, never India');
throws(() => accountsBase(), 'dc: accountsBase without a code is refused, never India');
ok(() => assert.equal(apiBase('people', 'in'), 'https://people.zoho.in'), 'dc: confirmed India People host');
ok(() => assert.equal(accountsBase('in'), 'https://accounts.zoho.in'), 'dc: India accounts host');
ok(() => assert.ok(isConfirmed('in')), 'dc: India is marked confirmed');
// CHANGED in E2.2A-1 (S9): .com was reached through this code on 2026-10-13/14 (test organisation).
ok(() => {
  assert.ok(isConfirmed('com'));
  assert.equal(DATA_CENTRES.com.accountsStatus, 'confirmed', 'tokens were minted on accounts.zoho.com');
  assert.equal(DATA_CENTRES.in.accountsStatus, 'unverified', 'no token was ever minted on accounts.zoho.in');
  assert.equal(apiBase('people', 'com'), 'https://people.zoho.com');
  assert.equal(accountsBase('com'), 'https://accounts.zoho.com');
}, 'dc: .com is recorded as verified (People and accounts hosts); .in accounts stays unverified');
ok(() => {
  for (const code of ['eu', 'au', 'jp', 'ca', 'sa']) assert.equal(isConfirmed(code), false, code);
}, 'dc: unreached DCs are not marked confirmed');
throws(() => dataCentre('xx'), 'dc: unknown code throws rather than defaulting to India');
throws(() => apiBase('crm', 'in'), 'dc: a product with no observed host refuses to guess one');
ok(() => assert.equal(dataCentre('IN').code, 'in'), 'dc: code is case-insensitive');
ok(() => {
  // Every DC must carry a People host, or the table is half-filled in a way that fails later.
  for (const dc of Object.values(DATA_CENTRES)) {
    assert.ok(dc.accounts.startsWith('https://'), dc.code);
    assert.ok(dc.apiHosts.people.startsWith('https://'), dc.code);
  }
}, 'dc: every entry has an https accounts and People host');

// ---------------------------------------------------------------- scopes
ok(() => assert.equal(scopeFor('people.forms.read'), 'ZOHOPEOPLE.forms.READ'), 'scopes: confirmed forms scope, exact casing');
// CHANGED in E2.2A-1 (S9): ZOHOPEOPLE.leave.READ was granted on the .com test token (2026-10-13).
ok(() => assert.equal(scopeFor('people.leave.read'), 'ZOHOPEOPLE.leave.READ'), 'scopes: leave scope recorded from the granted .com token, exact casing');
throws(() => scopeFor('people.attendance.read'), 'scopes: pending attendance scope refuses');
throws(() => scopeFor('people.nonsense'), 'scopes: unknown key throws');
ok(() => assert.deepEqual(requestedScopes(), ['ZOHOPEOPLE.forms.READ', 'ZOHOPEOPLE.leave.READ']), 'scopes: only confirmed scopes are ever requested — forms and leave, never attendance');
ok(() => assert.ok(isConfirmedScope('people.forms.read')), 'scopes: confirmed key reports true');
ok(() => assert.equal(isConfirmedScope('people.attendance.read'), false), 'scopes: pending key reports false (attendance)');
ok(() => {
  // A pending entry with a non-null scope would mean someone filled in a guess.
  for (const [key, def] of Object.entries(PENDING_SCOPES)) assert.equal(def.scope, null, key);
}, 'scopes: every pending entry is explicitly null');
ok(() => {
  for (const [key, def] of Object.entries(CONFIRMED_SCOPES)) {
    assert.ok(def.scope && def.confirmedOn && def.endpoint, key);
  }
}, 'scopes: every confirmed entry records what proved it');

// ---------------------------------------------------------------- dates
ok(() => assert.equal(ZOHO_DATE_FORMAT, 'dd-MMM-yyyy'), 'dates: the format Zoho was told to use');
ok(() => assert.equal(toZohoDate('2026-09-01'), '01-Sep-2026'), 'dates: ISO -> Zoho, matching the validated request');
ok(() => assert.equal(toZohoDate('2026-09-30'), '30-Sep-2026'), 'dates: ISO -> Zoho, end of range');
ok(() => assert.equal(toZohoDate('2026-01-05'), '05-Jan-2026'), 'dates: day is zero-padded');
ok(() => assert.equal(fromZohoDate('01-Sep-2026'), '2026-09-01'), 'dates: Zoho -> ISO');
ok(() => assert.equal(fromZohoDate('7-Sep-2026'), '2026-09-07'), 'dates: unpadded day accepted inbound');
ok(() => assert.equal(fromZohoDate('01-SEP-2026'), '2026-09-01'), 'dates: month case-insensitive inbound');
ok(() => {
  // Round-trip every month, so a table typo cannot hide in a month nobody tested.
  for (let i = 0; i < 12; i++) {
    const iso = `2026-${String(i + 1).padStart(2, '0')}-15`;
    assert.equal(fromZohoDate(toZohoDate(iso)), iso, iso);
  }
}, 'dates: all twelve months round-trip');
ok(() => assert.deepEqual(MONTHS, ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']), 'dates: month table is fixed English');
ok(() => {
  // The whole reason the table is hardcoded: a non-English locale must not change the output.
  // Sep is Sep whatever the host thinks the language is.
  assert.equal(toZohoDate('2026-09-01'), '01-Sep-2026');
  assert.notEqual(toZohoDate('2026-09-01'), new Date(Date.UTC(2026, 8, 1)).toLocaleDateString());
}, 'dates: output does not come from the runtime locale');
throws(() => toZohoDate('01-Sep-2026'), 'dates: outbound refuses a value already in Zoho format');
throws(() => toZohoDate('2026-13-01'), 'dates: outbound refuses month 13');
throws(() => toZohoDate('2026-02-31'), 'dates: outbound refuses a date that does not exist');
throws(() => toZohoDate(''), 'dates: outbound refuses empty');
throws(() => toZohoDate(null), 'dates: outbound refuses null');
ok(() => assert.equal(fromZohoDate('31-Feb-2026'), null), 'dates: inbound returns null for an impossible date');
ok(() => assert.equal(fromZohoDate('01-Xyz-2026'), null), 'dates: inbound returns null for an unknown month');
ok(() => assert.equal(fromZohoDate('garbage'), null), 'dates: inbound returns null, never throws');
ok(() => assert.equal(fromZohoDate(null), null), 'dates: inbound tolerates null');
ok(() => assert.equal(monthKey('2026-09-07'), '2026-09'), 'dates: monthKey is the sortable form the engine groups on');
ok(() => assert.equal(monthKey('bad'), null), 'dates: monthKey returns null rather than throwing');
ok(() => {
  // The exact parameter set the validated leave request used.
  assert.deepEqual(dateRangeParams('2026-09-01', '2026-09-30'), {
    from_date: '01-Sep-2026', to_date: '30-Sep-2026', date_format: 'dd-MMM-yyyy',
  });
}, 'dates: range params match the validated leave request');
throws(() => dateRangeParams('2026-09-30', '2026-09-01'), 'dates: a reversed range is refused, not silently swapped');

// ---------------------------------------------------------------- envelopes: v3
ok(() => {
  // The exact leave response that was validated.
  const r = unwrapV3({ data: [], message: 'Record(s) fetched successfully.', status: 'success' });
  assert.deepEqual(r.rows, []);
  assert.equal(r.empty, true);
}, 'envelope: validated leave response unwraps as an empty success');
ok(() => {
  // The exact attendance response. Different message text, same handling.
  const r = unwrapV3({ data: [], message: 'Request processed successfully.', status: 'success' });
  assert.deepEqual(r.rows, []);
  assert.equal(r.empty, true);
}, 'envelope: validated attendance response unwraps as an empty success');
ok(() => {
  const r = unwrapV3({ data: [{ a: 1 }, { a: 2 }], message: 'ok', status: 'success' });
  assert.equal(r.rows.length, 2);
  assert.equal(r.empty, false);
}, 'envelope: v3 rows pass through untouched');
ok(() => {
  // message is carried for logging but must never drive control flow - the two validated
  // endpoints return different strings for the same outcome.
  const a = unwrapV3({ data: [], message: 'Record(s) fetched successfully.', status: 'success' });
  const b = unwrapV3({ data: [], message: 'Request processed successfully.', status: 'success' });
  assert.equal(a.empty, b.empty);
}, 'envelope: differing message text does not change the outcome');
throws(() => unwrapV3({ status: 'success', message: 'ok' }), 'envelope: a missing data key is an error, not an empty result');
throws(() => unwrapV3({ data: {}, status: 'success' }), 'envelope: non-array data is refused');
throws(() => unwrapV3({ data: [], status: 'error', message: 'nope' }), 'envelope: non-success status throws');
throws(() => unwrapV3(null), 'envelope: null body throws');
ok(() => {
  try { unwrapV3({ data: [], status: 'error' }); } catch (e) {
    assert.equal(e.name, 'EnvelopeError');
    assert.equal(e.status, 502);
    // Keys only. Rows carry PII and must never ride along on an error.
    assert.deepEqual(e.observedKeys, ['data', 'status']);
    assert.equal(e.payload, undefined);
  }
}, 'envelope: an error records observed keys, never the body');

// ---------------------------------------------------------------- envelopes: forms
ok(() => {
  const r = flattenKeyedRecords({ '390': { EmailID: 'a@b.c' }, '391': { EmailID: 'd@e.f' } });
  assert.equal(r.rows.length, 2);
  assert.equal(r.rows[0].__recordId, '390');
  assert.equal(r.rows[0].EmailID, 'a@b.c');
}, 'envelope: forms records keyed by id flatten, id preserved as __recordId');
ok(() => {
  const r = flattenKeyedRecords({ '390': [{ EmailID: 'a@b.c' }] });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].__recordId, '390');
}, 'envelope: forms array-wrapped record also flattens');
ok(() => {
  // Raw Zoho field names survive this layer untouched - mapping them is a later phase, and this
  // module must not quietly rename anything.
  const r = flattenKeyedRecords({ '1': { EmailID: 'x', Department: 'Eng', Date_of_birth: '01-Jan-1990' } });
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['Date_of_birth', 'Department', 'EmailID', '__recordId']);
}, 'envelope: unwrapping does not map or drop fields');
ok(() => assert.equal(flattenKeyedRecords({}).empty, true), 'envelope: no forms records is an empty success');
throws(() => flattenKeyedRecords([]), 'envelope: an array where a keyed object belongs is refused');
throws(() => flattenKeyedRecords(null), 'envelope: null is refused');
// The wrapper path was unconfirmed through Phase 2 and unwrapForms refused. It was confirmed on
// 2026-09-07, so these now assert the resolved behaviour instead of the blocker.
throws(() => unwrapForms({ anything: true }), 'envelope: a body without the result node still throws');
ok(() => {
  // An explicit path still overrides, which is what the env variable drives.
  const body = { response: { result: [{ '390': { EmailID: 'a@b.c' } }] } };
  const r = unwrapForms(body, ['response', 'result']);
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].__recordId, '390');
}, 'envelope: unwrapForms works once a path is supplied');
throws(() => unwrapForms({ a: 1 }, ['nope', 'missing']), 'envelope: a wrong path throws rather than returning empty');

// ---------------------------------------------------------------- errors
ok(() => assert.equal(mapHttpError({ status: 403 }).status, 403), 'errors: 403 STAYS 403');
ok(() => assert.ok(mapHttpError({ status: 403 }) instanceof ZohoForbiddenError), 'errors: 403 maps to Forbidden');
ok(() => assert.equal(isRetryable(mapHttpError({ status: 403 })), false), 'errors: a 403 is never retried');
ok(() => assert.equal(isRefreshable(mapHttpError({ status: 403 })), false), 'errors: a 403 does not trigger a token refresh');
ok(() => assert.equal(mapHttpError({ status: 401 }).status, 401), 'errors: 401 maps to 401');
ok(() => assert.ok(mapHttpError({ status: 401 }) instanceof ZohoAuthError), 'errors: 401 maps to Auth');
ok(() => assert.ok(isRefreshable(mapHttpError({ status: 401 }))), 'errors: a 401 permits one refresh');
ok(() => assert.equal(isRetryable(mapHttpError({ status: 401 })), false), 'errors: a 401 is not retried as-is');
ok(() => assert.ok(mapHttpError({ status: 429 }) instanceof ZohoRateLimitError), 'errors: 429 maps to RateLimit');
ok(() => assert.ok(isRetryable(mapHttpError({ status: 429 }))), 'errors: a 429 is retryable');
ok(() => assert.equal(mapHttpError({ status: 429, headers: { 'retry-after': '30' } }).retryAfterSeconds, 30), 'errors: Retry-After is honoured, not guessed');
ok(() => assert.equal(mapHttpError({ status: 429, headers: { 'retry-after': 'soon' } }).retryAfterSeconds, null), 'errors: an unparseable Retry-After is null, not NaN');
ok(() => assert.equal(mapHttpError({ status: 500 }).status, 503), 'errors: upstream 5xx surfaces as 503');
ok(() => assert.equal(mapHttpError({ status: 503 }).status, 503), 'errors: upstream 503 stays 503');
ok(() => assert.ok(mapHttpError({ status: 500 }) instanceof ZohoUpstreamError), 'errors: 5xx maps to Upstream');
ok(() => assert.equal(mapHttpError({ status: 400 }).status, 502), 'errors: our own bad request is 502, not 403');
ok(() => assert.equal(mapNetworkError({ name: 'AbortError' }).status, 503), 'errors: a timeout is 503');
ok(() => assert.ok(/did not respond/.test(mapNetworkError({ name: 'AbortError' }).message)), 'errors: a timeout says so');
ok(() => assert.equal(mapNetworkError(new Error('ECONNREFUSED')).status, 503), 'errors: unreachable is 503');
ok(() => {
  // THE rule: no error anywhere offers a way to substitute seed data. If one ever grows a
  // fallback flag, the decision has moved back inside a catch block.
  const all = [
    mapHttpError({ status: 401 }), mapHttpError({ status: 403 }), mapHttpError({ status: 429 }),
    mapHttpError({ status: 500 }), mapHttpError({ status: 400 }), mapNetworkError(new Error('x')),
  ];
  for (const e of all) {
    assert.equal(e.useSeed, undefined, e.name);
    assert.equal(e.fallback, undefined, e.name);
    assert.equal(e.offline, undefined, e.name);
  }
}, 'errors: NO error offers a fallback to seed data');
ok(() => {
  const r = redact({ authorization: 'Bearer abc', access_token: 't', nested: { client_secret: 's', keep: 1 } });
  assert.equal(r.authorization, '[redacted]');
  assert.equal(r.access_token, '[redacted]');
  assert.equal(r.nested.client_secret, '[redacted]');
  assert.equal(r.nested.keep, 1);
}, 'errors: redact strips secrets at every depth and keeps the rest');
ok(() => assert.equal(redact({ Authorization: 'x' }).Authorization, '[redacted]'), 'errors: redact is case-insensitive');
ok(() => assert.equal(redact({ refresh_token: 'x' }).refresh_token, '[redacted]'), 'errors: refresh tokens are redacted');
ok(() => assert.deepEqual(redact([{ token: 'x' }])[0].token, '[redacted]'), 'errors: redact walks arrays');
ok(() => {
  // An OAuth error body can contain the token that just failed.
  const e = mapHttpError({ status: 401, body: { error: 'invalid_code', access_token: 'SECRET' } });
  assert.equal(JSON.stringify(e).includes('SECRET'), false);
  assert.equal(e.message.includes('SECRET'), false);
}, 'errors: a token in an error body never reaches the error');

// ---------------------------------------------------------------- data source
ok(() => assert.equal(resolveDataSource({}).source, SEED), 'dataSource: development defaults to the seed');
ok(() => assert.ok(resolveDataSource({}).isSeed), 'dataSource: isSeed reflects it');
ok(() => assert.equal(resolveDataSource({ NEUIQ_DATA_SOURCE: 'zoho' }).source, ZOHO), 'dataSource: zoho can be selected');
ok(() => assert.ok(resolveDataSource({ NODE_ENV: 'production', NEUIQ_DATA_SOURCE: 'zoho' }).isZoho), 'dataSource: production with zoho is fine');
throws(
  () => resolveDataSource({ NODE_ENV: 'production', NEUIQ_DATA_SOURCE: 'seed' }),
  'dataSource: PRODUCTION REFUSES TO START on the seed',
);
throws(
  () => resolveDataSource({ NODE_ENV: 'production' }),
  'dataSource: production refuses to start when nobody chose (unset defaults to seed)',
);
throws(() => resolveDataSource({ NEUIQ_DATA_SOURCE: 'postgres' }), 'dataSource: an unknown source throws');
ok(() => assert.equal(resolveDataSource({ NEUIQ_DATA_SOURCE: 'ZOHO' }).source, ZOHO), 'dataSource: value is case-insensitive');
ok(() => assert.ok(/demo data/.test(describeDataSource(resolveDataSource({})))), 'dataSource: the seed describes itself as demo data');
ok(() => assert.ok(/live/.test(describeDataSource(resolveDataSource({ NEUIQ_DATA_SOURCE: 'zoho' })))), 'dataSource: zoho describes itself as live');
ok(() => {
  // There must be no way to change the source after boot. If a setter appears, a request handler
  // can reach it, and the boot-time guarantee is gone.
  const resolved = resolveDataSource({});
  assert.equal(typeof resolved.set, 'undefined');
  assert.equal(typeof resolved.switch, 'undefined');
}, 'dataSource: the resolved descriptor exposes no way to change source at request time');

// ---------------------------------------------------------------- oauth provider
ok(() => assert.equal(isConfigured(configFromEnv({})), false), 'oauth: unconfigured reports false rather than throwing');
// CHANGED in E2.2A-1 (S2): this asserted an unset ZOHO_DC meant India.
ok(() => {
  assert.equal(configFromEnv({}).dc, null, 'unset is null, never a default');
  assert.equal(configFromEnv({ ZOHO_DC: '  ' }).dc, null, 'blank is unset');
  assert.equal(configFromEnv({ ZOHO_DC: ' COM ' }).dc, 'com', 'trimmed and lower-cased');
}, 'oauth: ZOHO_DC has no default — unset reads as null, not India');
ok(() => {
  // Sentinels are deliberately long and unmistakable. A short one like "sh" is a substring of
  // "refreshToken" and would make this assertion fail against correct code.
  const d = describeConfig(configFromEnv({
    ZOHO_CLIENT_ID: 'CLIENTID_SENTINEL',
    ZOHO_CLIENT_SECRET: 'CLIENTSECRET_SENTINEL',
    ZOHO_REFRESH_TOKEN: 'REFRESHTOKEN_SENTINEL',
  }));
  assert.equal(d.clientSecret, 'set');
  assert.equal(d.refreshToken, 'set');
  assert.equal(JSON.stringify(d).includes('CLIENTSECRET_SENTINEL'), false);
  assert.equal(JSON.stringify(d).includes('REFRESHTOKEN_SENTINEL'), false);
  assert.equal(JSON.stringify(d).includes('CLIENTID_SENTINEL'), false);
}, 'oauth: describeConfig reports presence, never values');

/**
 * Sentinel credentials for the provider tests.
 *
 * Values are long and unmistakable on purpose. Short ones like "secret" or "refresh" are
 * substrings of the key names describeConfig emits ("clientSecret", "refreshToken"), so a leak
 * assertion written against them fails on correct code and passes on nothing useful.
 */
const CONFIG = {
  dc: 'in',
  clientId: 'CID_SENTINEL',
  clientSecret: 'CSECRET_SENTINEL',
  refreshToken: 'RTOKEN_SENTINEL',
};
// CHANGED in E2.2: a token response must name the API domain of the DC it was minted for (the
// provider refuses anything else). CONFIG below is the `in` DC, so that is the default here.
const tokenResponse = (token, expiresIn = 3600, apiDomain = 'https://www.zohoapis.in') => ({
  ok: true, status: 200, headers: new Map(),
  json: async () => ({ access_token: token, expires_in: expiresIn, api_domain: apiDomain }),
});

await rejects(
  () => createTokenProvider({ config: configFromEnv({}), fetchImpl: async () => tokenResponse('t') }).getAccessToken(),
  'oauth: an unconfigured provider refuses rather than calling out',
);

ok(() => {
  const p = createTokenProvider({ config: CONFIG, fetchImpl: async () => tokenResponse('t') });
  assert.equal(String(p), '[ZohoTokenProvider]');
  assert.equal(JSON.stringify(p).includes('CSECRET_SENTINEL'), false);
  assert.equal(JSON.stringify(p).includes('RTOKEN_SENTINEL'), false);
  assert.equal(JSON.stringify(p).includes('CID_SENTINEL'), false);
  assert.equal(`${p}`.includes('CSECRET_SENTINEL'), false);
}, 'oauth: stringifying the provider cannot spill config');

await (async () => {
  let calls = 0;
  const p = createTokenProvider({ config: CONFIG, fetchImpl: async () => { calls++; return tokenResponse('tok-1'); } });
  assert.equal(await p.getAccessToken(), 'tok-1');
  assert.equal(await p.getAccessToken(), 'tok-1');
  assert.equal(calls, 1);
  n++; console.log('ok   oauth: a cached token is reused, not re-fetched');
})();

await (async () => {
  // Ten concurrent callers must produce ONE refresh. Zoho rate-limits the token endpoint hard.
  let calls = 0;
  const p = createTokenProvider({
    config: CONFIG,
    fetchImpl: async () => { calls++; await new Promise((r) => setTimeout(r, 5)); return tokenResponse('tok-x'); },
  });
  const results = await Promise.all(Array.from({ length: 10 }, () => p.getAccessToken()));
  assert.equal(calls, 1);
  assert.ok(results.every((t) => t === 'tok-x'));
  n++; console.log('ok   oauth: concurrent callers share ONE refresh (single-flight)');
})();

await (async () => {
  // A token expiring inside the skew window must be treated as already expired.
  let calls = 0;
  const p = createTokenProvider({
    config: CONFIG,
    fetchImpl: async () => { calls++; return tokenResponse(`tok-${calls}`, 60); },  // 60s < 120s skew
  });
  await p.getAccessToken();
  await p.getAccessToken();
  assert.equal(calls, 2);
  n++; console.log('ok   oauth: a token inside the expiry skew is refreshed, never handed out');
})();

await (async () => {
  let calls = 0;
  const p = createTokenProvider({ config: CONFIG, fetchImpl: async () => { calls++; return tokenResponse('t'); } });
  await p.getAccessToken();
  assert.equal(p.hasCachedToken(), true);
  p.invalidate();
  assert.equal(p.hasCachedToken(), false);
  await p.getAccessToken();
  assert.equal(calls, 2);
  n++; console.log('ok   oauth: invalidate() forces the next call to refresh');
})();

await (async () => {
  // Two DCs must never share a token: one minted on .in is invalid against .com.
  const seen = [];
  const p = createTokenProvider({
    config: CONFIG,
    // CHANGED in E2.2: each DC's token now carries that DC's api_domain, as Zoho's would.
    fetchImpl: async (url) => {
      seen.push(url);
      return tokenResponse(`tok-${seen.length}`, 3600, url.startsWith('https://accounts.zoho.com') ? 'https://www.zohoapis.com' : 'https://www.zohoapis.in');
    },
  });
  const a = await p.getAccessToken({ dc: 'in' });
  const b = await p.getAccessToken({ dc: 'com' });
  assert.notEqual(a, b);
  assert.ok(seen[0].startsWith('https://accounts.zoho.in'));
  assert.ok(seen[1].startsWith('https://accounts.zoho.com'));
  n++; console.log('ok   oauth: the token cache is keyed by data centre');
})();

await (async () => {
  // Credentials belong in the body. A secret in a query string lands in every access log.
  let capturedUrl = null; let capturedBody = null;
  const p = createTokenProvider({
    config: CONFIG,
    fetchImpl: async (url, init) => { capturedUrl = url; capturedBody = String(init.body); return tokenResponse('t'); },
  });
  await p.getAccessToken();
  assert.equal(capturedUrl.includes('CSECRET_SENTINEL'), false);
  assert.equal(capturedUrl.includes('RTOKEN_SENTINEL'), false);
  assert.equal(capturedUrl.includes('?'), false);
  assert.ok(capturedBody.includes('client_secret=CSECRET_SENTINEL'));
  n++; console.log('ok   oauth: credentials go in the body, never the URL');
})();

await rejects(
  () => createTokenProvider({
    config: CONFIG,
    fetchImpl: async () => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ error: 'invalid_client' }) }),
  }).getAccessToken(),
  'oauth: a 200 carrying an error body is still a failure',
);

await rejects(
  () => createTokenProvider({
    config: CONFIG,
    fetchImpl: async () => ({ ok: false, status: 401, headers: new Map(), json: async () => ({ error: 'invalid_code' }) }),
  }).getAccessToken(),
  'oauth: a rejected refresh surfaces as an error, never as a null token',
);

await (async () => {
  // A failed refresh must not poison the cache with a broken entry.
  const p = createTokenProvider({
    config: CONFIG,
    fetchImpl: async () => { throw new Error('ECONNREFUSED'); },
  });
  await assert.rejects(() => p.getAccessToken());
  assert.equal(p.hasCachedToken(), false);
  n++; console.log('ok   oauth: a failed refresh leaves no cached token behind');
})();

await (async () => {
  // And a failure must not wedge single-flight: the next call has to be able to try again.
  let calls = 0;
  const p = createTokenProvider({
    config: CONFIG,
    fetchImpl: async () => { calls++; if (calls === 1) throw new Error('boom'); return tokenResponse('recovered'); },
  });
  await assert.rejects(() => p.getAccessToken());
  assert.equal(await p.getAccessToken(), 'recovered');
  n++; console.log('ok   oauth: a failed refresh does not wedge the next attempt');
})();

ok(() => {
  const p = createTokenProvider({ config: CONFIG, fetchImpl: async () => tokenResponse('t') });
  const s = p.status();
  assert.equal(s.configured, true);
  assert.equal(s.clientSecret, 'set');
  assert.equal(JSON.stringify(s).includes('secret'), false);
}, 'oauth: status() is safe to expose on /health');

// ---------------------------------------------------------------- leave transformer
//
// The fixture below uses ONLY fields confirmed in a real non-empty response on 2026-09-07.
// Nothing invented, and the extra keys in one case exist to prove they get dropped.

/** One leave record, shaped exactly like the confirmed payload. */
const RAW_LEAVE = {
  leave_id: '55500000012345',
  unit: 'Days',
  from_date: '02-Sep-2026',
  to_date: '03-Sep-2026',
  date_of_request: '28-Aug-2026',
  approval_status: 'Approved',
  leave_type: { name: 'Casual Leave', id: '55500000000111', type: 'Paid' },
  employee: {
    zoho_id: '55500000000999',
    name: 'Alex Mathew',
    avatar: 'https://contacts.zoho.in/file?ID=abc&fs=thumb',
    id: 'E1001',
  },
  days: {
    '02-Sep-2026': { leave_count: '1.0', session: 'Full Day' },
    '03-Sep-2026': { leave_count: '0.5', session: 'Session 1' },
  },
};

ok(() => {
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal(r.recordId, '55500000012345');
}, 'leave: leave_id becomes the record identifier');
ok(() => {
  // The engine scopes on employeeId, and this must be zoho_id - the same identifier the
  // endpoint's own employee_zoho_ids parameter takes.
  assert.equal(transformLeaveRecord(RAW_LEAVE).employeeId, '55500000000999');
}, 'leave: employee.zoho_id is the canonical employee identifier');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).employeeAltId, 'E1001'), 'leave: employee.id preserved separately, not conflated');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).employeeName, 'Alex Mathew'), 'leave: employee name mapped');

ok(() => {
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal(r.from, '2026-09-02');
  assert.equal(r.to, '2026-09-03');
  assert.equal(r.requestedOn, '2026-08-28');
}, 'leave: all three dates convert dd-MMM-yyyy -> ISO');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).month, '2026-09'), 'leave: month is the sortable key the engine groups on');

ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).leaveType, 'Casual Leave'), 'leave: leave_type.name becomes leaveType');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).leaveTypeId, '55500000000111'), 'leave: leave_type.id preserved');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).leaveTypeCategory, 'Paid'), 'leave: leave_type.type preserved');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).unit, 'Days'), 'leave: unit preserved');
ok(() => assert.equal(transformLeaveRecord(RAW_LEAVE).status, 'Approved'), 'leave: approval_status becomes status');
ok(() => {
  // CHANGED in Step 11.6. This used to assert the value was carried verbatim ('APPROVED'). Zoho's
  // own docs disagree on casing and live data sent an undocumented NO_STATUS, so verbatim values
  // made every `=== 'Approved'` check fail on live data. Status is now normalised, and the
  // verbatim value survives as statusRaw — nothing Zoho sent is lost.
  const upper = transformLeaveRecord({ ...RAW_LEAVE, approval_status: 'APPROVED' });
  assert.equal(upper.status, 'Approved');
  assert.equal(upper.statusRaw, 'APPROVED');
}, 'leave: status is normalised case-insensitively, and the raw value is kept as statusRaw');

ok(() => {
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal(r.dayBreakdown.length, 2);
  assert.deepEqual(r.dayBreakdown[0], {
    date: '2026-09-02', sourceDate: '02-Sep-2026', leaveCount: 1, session: 'Full Day',
  });
}, 'leave: the dynamic days object becomes normalized dayBreakdown entries');
ok(() => {
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal(typeof r.dayBreakdown[0].leaveCount, 'number');
  assert.equal(r.dayBreakdown[1].leaveCount, 0.5);
}, 'leave: leave_count is converted to a number, half-days preserved');
ok(() => {
  // THE collision: Zoho's `days` is an object, ours is the number the engine aggregates.
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal(typeof r.days, 'number');
  assert.equal(r.days, 1.5);
}, 'leave: `days` is the summed number the query engine can aggregate, not Zoho\'s object');
ok(() => {
  const r = transformLeaveRecord({
    ...RAW_LEAVE,
    days: { '03-Sep-2026': { leave_count: 1 }, '01-Sep-2026': { leave_count: 1 } },
  });
  assert.deepEqual(r.dayBreakdown.map((d) => d.date), ['2026-09-01', '2026-09-03']);
}, 'leave: dayBreakdown is sorted into calendar order');
ok(() => {
  // An unparseable key must not lose the data - sourceDate still holds what Zoho sent.
  const r = transformLeaveRecord({ ...RAW_LEAVE, days: { 'weird-key': { leave_count: 2 } } });
  assert.equal(r.dayBreakdown[0].date, null);
  assert.equal(r.dayBreakdown[0].sourceDate, 'weird-key');
  assert.equal(r.days, 2);
}, 'leave: an unrecognised day key keeps its raw value rather than dropping the count');
ok(() => {
  const r = transformLeaveRecord({ ...RAW_LEAVE, days: { '02-Sep-2026': { leave_count: 'nonsense' } } });
  assert.equal(r.days, 0);
  assert.equal(Number.isNaN(r.days), false);
}, 'leave: an unparseable leave_count contributes 0, never NaN');
ok(() => assert.deepEqual(transformLeaveRecord({ ...RAW_LEAVE, days: undefined }).dayBreakdown, []), 'leave: a missing days object is empty, not a throw');
ok(() => assert.equal(transformLeaveRecord({ ...RAW_LEAVE, days: undefined }).days, 0), 'leave: no day detail sums to 0');

ok(() => {
  // Requirement: the avatar must not reach the LLM or the query layer by default.
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal('employeeAvatar' in r, false);
  assert.equal(JSON.stringify(r).includes('contacts.zoho.in'), false);
  assert.equal(JSON.stringify(r).includes('avatar'), false);
}, 'leave: employee.avatar is NOT exposed by default');
ok(() => {
  const r = transformLeaveRecord(RAW_LEAVE, { includeAvatar: true });
  assert.equal(r.employeeAvatar, 'https://contacts.zoho.in/file?ID=abc&fs=thumb');
}, 'leave: the avatar is available only on explicit opt-in');

ok(() => {
  // An allow-list, not a rename pass. The employee form was already returning Date_of_birth and
  // Gender; a deny-list would carry the next such field straight into a prompt.
  const r = transformLeaveRecord({
    ...RAW_LEAVE,
    Date_of_birth: '01-Jan-1990',
    Gender: 'Male',
    salary: 999999,
    employee: { ...RAW_LEAVE.employee, personal_mobile: '+910000000000' },
  });
  const json = JSON.stringify(r);
  for (const leaked of ['Date_of_birth', 'Gender', 'salary', '999999', 'personal_mobile', '+910000000000']) {
    assert.equal(json.includes(leaked), false, leaked);
  }
}, 'leave: unknown fields are DROPPED, including nested ones');
ok(() => {
  const keys = Object.keys(transformLeaveRecord(RAW_LEAVE)).sort();
  assert.deepEqual(keys, [
    'dayBreakdown', 'days', 'employeeAltId', 'employeeId', 'employeeName',
    'from', 'leaveType', 'leaveTypeCategory', 'leaveTypeId', 'month', 'recordId', 'requestedOn',
    'status', 'statusRaw', 'to', 'unit',
  ].sort());
}, 'leave: the output shape is exactly the mapped fields, nothing more');

ok(() => {
  // A row with no identifier fails CLOSED: the scope filter compares undefined against the
  // caller and does not match, so it is excluded from a scoped read rather than leaking into one.
  const r = transformLeaveRecord({ ...RAW_LEAVE, employee: {} });
  assert.equal(r.employeeId, null);
  assert.notEqual(r.employeeId, '55500000000999');
}, 'leave: a record with no employee id yields null, which fails closed under scoping');

ok(() => assert.equal(transformLeaveRecord(null), null), 'leave: null input returns null');
ok(() => assert.equal(transformLeaveRecord([]), null), 'leave: an array is not a record');
ok(() => assert.equal(transformLeaveRecord({}).recordId, null), 'leave: an empty object yields nulls, not a throw');
ok(() => assert.deepEqual(transformLeaveRecords([]), []), 'leave: an empty page is an empty array');
ok(() => assert.deepEqual(transformLeaveRecords(null), []), 'leave: a non-array page is empty, not a throw');
ok(() => assert.equal(transformLeaveRecords([RAW_LEAVE, null, 'x', RAW_LEAVE]).length, 2), 'leave: unusable entries are dropped from a page');

ok(() => {
  // End to end from the confirmed envelope, which is how this will actually be called.
  const rows = transformLeaveRecords(unwrapV3({
    data: [RAW_LEAVE], message: 'Record(s) fetched successfully.', status: 'success',
  }).rows);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].days, 1.5);
  assert.equal(rows[0].month, '2026-09');
}, 'leave: unwrapV3 -> transform produces engine-ready rows');
ok(() => {
  const rows = transformLeaveRecords(unwrapV3({
    data: [], message: 'Record(s) fetched successfully.', status: 'success',
  }).rows);
  assert.deepEqual(rows, []);
}, 'leave: the validated empty response stays an empty success through the transformer');

ok(() => {
  // The gaps are recorded in code so they are not rediscovered as bugs. departmentId is declared
  // groupable on `leave` in sources.js but does not exist in this payload.
  const r = transformLeaveRecord(RAW_LEAVE);
  assert.equal('departmentId' in r, false);
  assert.ok(LEAVE_GAPS.departmentId.includes('department'));
  assert.ok(LEAVE_GAPS.statusValues.includes('approval_status'));
}, 'leave: the departmentId gap is absent from the row and recorded, not invented');
ok(() => {
  // A guard on the allow-list itself: if someone adds a field here, they have to say where the
  // observation came from.
  assert.equal(CONFIRMED_LEAVE_FIELDS.length, 15);
  assert.ok(CONFIRMED_LEAVE_FIELDS.includes('employee.zoho_id'));
  assert.equal(CONFIRMED_LEAVE_FIELDS.includes('department'), false);
}, 'leave: the confirmed field list matches what was actually observed');

// ---------------------------------------------------------------- endpoints ledger
ok(() => assert.equal(endpoint('people.leave.list').path, '/people/api/v3/leave-tracker/leaves'), 'endpoints: confirmed leave path');
ok(() => assert.equal(endpoint('people.attendance.entries').path, '/people/api/v3/attendance/entries'), 'endpoints: confirmed attendance path');
ok(() => assert.equal(endpoint('people.employee.records').envelope, 'forms'), 'endpoints: employee uses the forms envelope');
ok(() => assert.equal(endpoint('people.leave.list').envelope, 'v3'), 'endpoints: leave uses the v3 envelope');
throws(() => endpoint('people.timesheets'), 'endpoints: an unrecorded endpoint throws rather than guessing a path');

ok(() => assert.ok(LEAVE_DATA_SELECT.confirmed.includes('ALL')), 'endpoints: data_select=ALL is recorded as confirmed');
ok(() => assert.ok(LEAVE_DATA_SELECT.confirmed.includes('MINE')), 'endpoints: data_select=MINE remains confirmed');
ok(() => {
  // Documented-but-untried values must not have leaked into the confirmed list.
  for (const v of LEAVE_DATA_SELECT.documented) {
    assert.equal(LEAVE_DATA_SELECT.confirmed.includes(v), false, v);
  }
}, 'endpoints: untried data_select values stay out of the confirmed list');
ok(() => {
  // employee_zoho_ids is documented only. Sending it now would be an untested assumption, and
  // confirming it is security work - it is the second fence behind our read-time filter.
  assert.ok(DOCUMENTED_UNTRIED['people.leave.list'].includes('employee_zoho_ids'));
  assert.equal(endpoint('people.leave.list').confirmedParams.includes('employee_zoho_ids'), false);
}, 'endpoints: employee_zoho_ids is documented, not confirmed, and is not sent');

ok(() => {
  // ALL for every role is the deliberate consequence of the service-account model: MINE would
  // resolve to the service identity, not the caller.
  const roles = [{ role: 'employee' }, { role: 'manager' }, { role: 'hr_admin' }];
  for (const u of roles) assert.equal(dataSelectFor(u), 'ALL', u.role);
}, 'endpoints: every role sends data_select=ALL under the service-account model');
ok(() => {
  // Whatever dataSelectFor returns must be something we have actually seen work.
  assert.ok(LEAVE_DATA_SELECT.confirmed.includes(dataSelectFor({ role: 'employee' })));
}, 'endpoints: dataSelectFor only ever returns a confirmed value');

ok(() => {
  // The two v3 endpoints identify employees differently. This is the mapping problem AuthzContext
  // has to solve, recorded as a test so it is not rediscovered when the client is written.
  assert.ok(endpoint('people.attendance.entries').confirmedParams.includes('employee_email_id'));
  assert.equal(endpoint('people.leave.list').confirmedParams.includes('employee_email_id'), false);
}, 'endpoints: leave and attendance take DIFFERENT employee identifiers');

ok(() => {
  // The endpoint ledger points at scope keys. A scope is promoted only on evidence of the GRANT,
  // never because an endpoint answered (confirming data_select proved nothing about scopes).
  // CHANGED in E2.2A-1 (S9): leave was promoted on that evidence — the .com test token's granted
  // scope list carried ZOHOPEOPLE.leave.READ (2026-10-13). Attendance has no such evidence.
  assert.equal(isConfirmedScope(endpoint('people.employee.records').scopeKey), true);
  assert.equal(isConfirmedScope(endpoint('people.leave.list').scopeKey), true);
  assert.equal(CONFIRMED_SCOPES['people.leave.read'].confirmedOn, '2026-10-13');
  assert.equal(isConfirmedScope(endpoint('people.attendance.entries').scopeKey), false);
}, 'endpoints: scopes are promoted only on a recorded grant — leave (granted on .com), never attendance');

// ---------------------------------------------------------------- cache
ok(() => {
  // THE cache rule: a key without a caller is a data leak wearing a cache's clothes.
  assert.throws(() => cacheKey(null, 'leave'));
  assert.throws(() => cacheKey('', 'leave'));
}, 'cache: a key cannot be built without a caller');
ok(() => assert.notEqual(cacheKey('E1001', 'leave'), cacheKey('E1004', 'leave')), 'cache: two callers never share a key');
ok(() => {
  // Key order in a spec object must not change the key, or the cache silently misses.
  assert.equal(cacheKey('E1', { a: 1, b: 2 }), cacheKey('E1', { b: 2, a: 1 }));
}, 'cache: object key order does not change the key');
await (async () => {
  let t = 1000;
  const c = createCache({ now: () => t });
  let loads = 0;
  const load = async () => { loads++; return 'v'; };
  assert.equal(await c.wrap('k', 60, load), 'v');
  assert.equal(await c.wrap('k', 60, load), 'v');
  assert.equal(loads, 1);
  t += 61_000;
  assert.equal(await c.wrap('k', 60, load), 'v');
  assert.equal(loads, 2);
  n++; console.log('ok   cache: entries are reused until the TTL expires');
})();
await (async () => {
  const c = createCache();
  await assert.rejects(() => c.wrap('k', 60, async () => { throw new Error('boom'); }));
  assert.equal(c.get('k'), undefined);
  n++; console.log('ok   cache: a rejected loader is never cached');
})();

// ---------------------------------------------------------------- zoho http client
const okRes = (body) => ({ ok: true, status: 200, headers: new Map(), json: async () => body });
const errRes = (status, body = {}, headers = new Map()) =>
  ({ ok: false, status, headers, json: async () => body });
const stubProvider = () => {
  let invalidated = 0;
  return {
    getAccessToken: async () => 'tok',
    invalidate: () => { invalidated++; },
    invalidations: () => invalidated,
  };
};
const quietLogger = { log() {}, warn() {} };

await (async () => {
  let capturedUrl = null; let capturedInit = null;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    fetchImpl: async (url, init) => { capturedUrl = url; capturedInit = init; return okRes({ ok: 1 }); },
  });
  await c.get('/people/api/v3/leave-tracker/leaves', { params: { from_date: '01-Sep-2026' } });
  assert.ok(capturedUrl.startsWith('https://people.zoho.in/'));
  assert.ok(capturedUrl.includes('from_date=01-Sep-2026'));
  assert.equal(capturedInit.headers.authorization, 'Zoho-oauthtoken tok');
  n++; console.log('ok   client: hits the confirmed India host with Zoho-oauthtoken auth');
})();

await (async () => {
  // A 401 buys one refresh and one retry. A second 401 is a real credential problem.
  const provider = stubProvider();
  let calls = 0;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: provider, logger: quietLogger,
    fetchImpl: async () => { calls++; return calls === 1 ? errRes(401) : okRes({ ok: 1 }); },
  });
  assert.deepEqual(await c.get('/x'), { ok: 1 });
  assert.equal(calls, 2);
  assert.equal(provider.invalidations(), 1);
  n++; console.log('ok   client: a 401 refreshes the token once and retries once');
})();

await (async () => {
  let calls = 0;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    fetchImpl: async () => { calls++; return errRes(401); },
  });
  await assert.rejects(() => c.get('/x'));
  assert.equal(calls, 2);
  n++; console.log('ok   client: a second 401 gives up rather than looping');
})();

await (async () => {
  // THE rule: a refusal repeated is still a refusal. Retrying burns quota and changes nothing.
  let calls = 0;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    fetchImpl: async () => { calls++; return errRes(403); },
  });
  await assert.rejects(() => c.get('/x'), (e) => e.status === 403);
  assert.equal(calls, 1);
  n++; console.log('ok   client: a 403 is NEVER retried and stays a 403');
})();

await (async () => {
  const waits = [];
  let calls = 0;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    sleepImpl: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { calls++; return calls < 3 ? errRes(500) : okRes({ ok: 1 }); },
  });
  assert.deepEqual(await c.get('/x'), { ok: 1 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [300, 600]);
  n++; console.log('ok   client: 5xx retries with exponential backoff');
})();

await (async () => {
  const waits = [];
  let calls = 0;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    sleepImpl: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { calls++; return calls === 1 ? errRes(429, {}, new Map([['retry-after', '2']])) : okRes({ ok: 1 }); },
  });
  await c.get('/x');
  assert.deepEqual(waits, [2000]);
  n++; console.log('ok   client: Retry-After is honoured rather than guessed');
})();

await (async () => {
  // A hostile or mistaken Retry-After must not park a request for an hour.
  const waits = [];
  let calls = 0;
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    sleepImpl: async (ms) => { waits.push(ms); },
    fetchImpl: async () => { calls++; return calls === 1 ? errRes(429, {}, new Map([['retry-after', '99999']])) : okRes({ ok: 1 }); },
  });
  await c.get('/x');
  assert.equal(waits[0], 10_000);
  n++; console.log('ok   client: an absurd Retry-After is capped');
})();

await (async () => {
  // An error body can carry the token that just failed.
  const lines = [];
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(),
    logger: { log() {}, warn: (l) => lines.push(l) },
    fetchImpl: async () => errRes(400, { message: 'bad', access_token: 'SECRET_TOKEN' }),
  });
  await assert.rejects(() => c.get('/x'));
  assert.equal(lines.join('').includes('SECRET_TOKEN'), false);
  assert.ok(lines.join('').includes('[redacted]'));
  n++; console.log('ok   client: a token in an error body is redacted before it is logged');
})();

// ---------------------------------------------------------------- large-integer precision
// Zoho People sends 18-digit ids as JSON NUMBERS (observed live, 2026-10-13). JSON.parse rounds
// anything past 2^53 - 1, silently: a real leave row's employee id came back 27 away from the
// truth, and `__recordId` (an object key, so always a string) stopped equalling `Zoho_ID` — the
// same id. These fixtures use synthetic 18-digit ids; none is a real record.
const BIG_RECORD = '555000000012345678';
const BIG_OTHER = '555000000012345679';
const BIG_LEAVE = '555000000098765433';
const BIG_TYPE = '555000000000111117';
// Guard the fixtures themselves: if plain JSON.parse did NOT lose these, the tests below would
// pass for the wrong reason.
ok(() => {
  for (const id of [BIG_RECORD, BIG_LEAVE, BIG_TYPE]) assert.notEqual(String(JSON.parse(id)), id, id);
  // Two different employees collapse to ONE value under plain JSON.parse.
  assert.equal(JSON.parse(BIG_RECORD), JSON.parse(BIG_OTHER));
}, 'precision: fixtures really are corrupted by plain JSON.parse (and two ids collide)');
ok(() => assert.equal(SOURCE_TEXT_SUPPORTED, true), 'precision: this runtime gives JSON.parse revivers the source text');

// Raw bodies exactly as Zoho shapes them: ids as unquoted numeric literals.
const RAW_FORMS_TEXT = `{"response":{"result":[
  {"${BIG_RECORD}":[{"Zoho_ID":${BIG_RECORD},"EmailID":"a@example.test","Department":"Engineering","Employee_type.id":${BIG_TYPE},"Reporting_To.ID":"${BIG_OTHER}"}]},
  {"${BIG_OTHER}":[{"Zoho_ID":${BIG_OTHER},"EmailID":"b@example.test","Department":"People","Employee_type.id":${BIG_TYPE},"Reporting_To.ID":""}]}
],"message":"Data fetched successfully","uri":"/x","status":0}}`;
const RAW_LEAVE_TEXT = `{"data":[{"leave_id":${BIG_LEAVE},"unit":"Days","from_date":"02-Sep-2026","to_date":"02-Sep-2026",
  "date_of_request":"01-Sep-2026","approval_status":"NO_STATUS",
  "leave_type":{"name":"Unpaid Leave","id":${BIG_TYPE},"type":"UNPAID"},
  "employee":{"zoho_id":${BIG_RECORD},"name":"Test Person","avatar":"https://example.test/a","id":"AB123"},
  "days":{"02-Sep-2026":{"leave_count":"1.0","session":"Full Day"}}}],"message":"Record(s) fetched successfully.","status":"success"}`;

ok(() => {
  const body = parseZohoJson(RAW_FORMS_TEXT);
  const rec = body.response.result[0][BIG_RECORD][0];
  assert.equal(rec.Zoho_ID, BIG_RECORD);
  assert.equal(typeof rec.Zoho_ID, 'string');
  assert.equal(rec['Employee_type.id'], BIG_TYPE);
  // The point of the fix: the record key and the Zoho_ID field are the same id again.
  assert.equal(Object.keys(body.response.result[0])[0], rec.Zoho_ID);
  // Small numbers in the same body are untouched.
  assert.equal(body.response.status, 0);
}, 'precision: employee Zoho_ID survives exactly and equals its __recordId key');
ok(() => {
  const row = parseZohoJson(RAW_LEAVE_TEXT).data[0];
  assert.equal(row.employee.zoho_id, BIG_RECORD);
  assert.equal(row.leave_id, BIG_LEAVE);
  assert.equal(row.leave_type.id, BIG_TYPE);
  for (const v of [row.employee.zoho_id, row.leave_id, row.leave_type.id]) assert.equal(typeof v, 'string');
}, 'precision: leave employee.zoho_id, leave_id and leave_type.id survive exactly');

await (async () => {
  // End to end through the real client, a real fetch Response, and both transformers.
  const bodies = { '/forms': RAW_FORMS_TEXT, '/leave': RAW_LEAVE_TEXT };
  const lines = [];
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(),
    logger: { log: (l) => lines.push(l), warn: (l) => lines.push(l) },
    fetchImpl: async (url) => new Response(bodies[new URL(url).pathname], { status: 200, headers: { 'content-type': 'application/json' } }),
  });
  const employees = transformEmployeeRecords(unwrapForms(await c.get('/forms')).rows);
  const leave = transformLeaveRecords(unwrapV3(await c.get('/leave')).rows);

  assert.deepEqual(employees.map((e) => e.recordId), [BIG_RECORD, BIG_OTHER]);
  assert.equal(employees[0].employmentTypeId, BIG_TYPE);
  assert.equal(leave.length, 1);
  // The join the whole identity chain rests on: leave owner === employee __recordId, exactly.
  assert.equal(leave[0].employeeId, employees[0].recordId);
  assert.notEqual(leave[0].employeeId, employees[1].recordId);
  assert.equal(leave[0].recordId, BIG_LEAVE);
  assert.equal(leave[0].leaveTypeId, BIG_TYPE);
  assert.equal(leave[0].employeeAltId, 'AB123');
  assert.equal(leave[0].days, 1);

  // What the client logged: method/path/status only — no id, email, name or token.
  const logged = lines.join('\n');
  for (const s of [BIG_RECORD, BIG_OTHER, BIG_LEAVE, 'example.test', 'Test Person', 'tok']) {
    assert.equal(logged.includes(s), false, s);
  }
  n++; console.log('ok   precision: client -> transformers keep leave.employeeId === employee __recordId exactly, and log no ids');
})();

ok(() => {
  // Ordinary JSON must parse exactly as JSON.parse would.
  const text = JSON.stringify({
    zero: 0, small: 42, negative: -17, maxSafe: Number.MAX_SAFE_INTEGER, minSafe: Number.MIN_SAFE_INTEGER,
    half: 0.5, fraction: 1.5, negFraction: -2.25, exp: 1e3, t: true, f: false, nil: null,
    s: '555000000012345678', nested: { list: [1, 2.5, null, 'x', { deep: -3 }] }, empty: [], obj: {},
  });
  assert.deepEqual(parseZohoJson(text), JSON.parse(text));
}, 'precision regression: safe integers, fractions, negatives, booleans, null, strings, arrays and objects unchanged');
ok(() => {
  assert.equal(parseZohoJson('-555000000012345678'), '-555000000012345678');
  assert.equal(parseZohoJson('9007199254740992'), '9007199254740992');   // 2^53: first unsafe integer
  assert.equal(parseZohoJson('9007199254740991'), 9007199254740991);     // 2^53 - 1: still a number
  assert.equal(parseZohoJson('[555000000012345678]')[0], '555000000012345678');
}, 'precision: the boundary is exact — 2^53 - 1 stays a number, 2^53 and beyond (either sign) become strings');
ok(() => {
  // Not identifiers: a large decimal and an exponent form keep JSON.parse's number.
  assert.equal(typeof parseZohoJson('12345678901234567.5'), 'number');
  assert.equal(typeof parseZohoJson('1e20'), 'number');
  assert.equal(parseZohoJson('{"a":1.0}').a, 1);
}, 'precision: only plain integer literals are converted; decimals and exponents are left alone');
ok(() => {
  assert.throws(() => parseZohoJson('{"a":'), SyntaxError);
  assert.throws(() => parseZohoJson(''), SyntaxError);
  assert.throws(() => parseZohoJson('{"a": 555000000012345678,}'), SyntaxError);
}, 'precision: malformed JSON still throws, it is not repaired');

await (async () => {
  // Through the client a malformed 200 body is still null, as before — and the envelope
  // unwrapper turns that into a shape error, never an empty result.
  const c = createZohoClient({
    product: 'people', dc: 'in', tokenProvider: stubProvider(), logger: quietLogger,
    fetchImpl: async () => new Response('{"data": [', { status: 200 }),
  });
  const body = await c.get('/x');
  assert.equal(body, null);
  assert.throws(() => unwrapV3(body));
  n++; console.log('ok   precision: a malformed body is null from the client and a shape error from the unwrapper');
})();

ok(() => {
  // Defence in depth: a number that was already rounded upstream must not become a plausible id.
  const e = transformEmployeeRecord({ __recordId: BIG_RECORD, EmailID: 'a@example.test', 'Employee_type.id': JSON.parse(BIG_TYPE) });
  assert.equal(e.employmentTypeId, null);
  assert.equal(transformEmployeeRecord({ __recordId: 'R', 'Employee_type.id': 42 }).employmentTypeId, '42');
  // Leave already accepts only strings, so a rounded number fails closed rather than mis-scoping.
  const l = transformLeaveRecord({ ...JSON.parse(RAW_LEAVE_TEXT).data[0] });
  assert.equal(l.employeeId, null);
}, 'precision: transformers refuse an already-rounded number rather than emit a wrong id');

// ---------------------------------------------------------------- employee transformer
/**
 * The real employee response, exactly as captured on 2026-09-07:
 *
 *   response.result -> [ { "<record_id>": [ { EmailID, "Employee_type.id", Department, ... } ] } ]
 *
 * Note `Employee_type.id` is a FLAT key containing a dot, not a nested object.
 */
const LIVE_EMPLOYEE_BODY = {
  response: {
    result: [
      {
        '55500000000999': [{
          EmailID: 'Asha.Verma@example.test',
          'Employee_type.id': '4200000000021',
          Department: 'Engineering',
          Date_of_birth: '01-Jan-1990',
          Gender: 'Male',
          Photo: 'https://contacts.zoho.in/file?ID=xyz',
        }],
      },
      {
        '55500000001000': [{
          EmailID: 'Kiran.Desai@example.test',
          'Employee_type.id': '4200000000021',
          Department: 'Engineering',
          Date_of_birth: '02-Feb-1992',
          Gender: 'Female',
        }],
      },
      {
        '55500000001001': [{
          EmailID: 'Neel.Joshi@example.test',
          'Employee_type.id': '4200000000022',
          Department: 'People',
          Gender: 'Female',
        }],
      },
    ],
  },
};

/** One flattened record, as unwrapForms hands it to the transformer. */
const RAW_EMPLOYEE = {
  __recordId: '55500000000999',
  EmailID: 'Asha.Verma@example.test',
  'Employee_type.id': '4200000000021',
  Department: 'Engineering',
  Date_of_birth: '01-Jan-1990',
  Gender: 'Male',
  Photo: 'https://contacts.zoho.in/file?ID=xyz',
};

ok(() => {
  // The confirmed path, working with no configuration required.
  assert.deepEqual(FORMS_RESULT_PATH, ['response', 'result']);
}, 'forms: the confirmed result path is response.result, no env needed');
ok(() => {
  const r = unwrapForms(LIVE_EMPLOYEE_BODY);
  assert.equal(r.rows.length, 3);
  assert.equal(r.rows[0].__recordId, '55500000000999');
  assert.equal(r.rows[0].EmailID, 'Asha.Verma@example.test');
}, 'forms: the real payload unwraps to one row per record');
ok(() => {
  // result holds an ARRAY of keyed objects. Assuming length 1 would return one employee of fifty.
  const ids = unwrapForms(LIVE_EMPLOYEE_BODY).rows.map((r) => r.__recordId);
  assert.deepEqual(ids, ['55500000000999', '55500000001000', '55500000001001']);
}, 'forms: EVERY element of the result array is flattened, not just the first');
ok(() => assert.equal(unwrapForms({ response: { result: [] } }).empty, true), 'forms: an empty result array is a successful empty read');
throws(() => unwrapForms({ response: {} }), 'forms: a missing result node throws rather than reading as empty');

ok(() => {
  const r = transformEmployeeRecord(RAW_EMPLOYEE);
  assert.equal(r.recordId, '55500000000999');
  assert.equal(r.email, 'Asha.Verma@example.test');
  assert.equal(r.department, 'Engineering');
  assert.equal(r.employmentTypeId, '4200000000021');
}, 'employee: the confirmed fields map');
ok(() => {
  // The concrete reason this layer is an allow-list: both of these were in the first real payload.
  const json = JSON.stringify(transformEmployeeRecord(RAW_EMPLOYEE));
  for (const pii of ['Date_of_birth', '1990', 'Gender', 'Male']) {
    assert.equal(json.includes(pii), false, pii);
  }
}, 'employee: Date_of_birth and Gender are DROPPED, never emitted');
ok(() => {
  const json = JSON.stringify(transformEmployeeRecord({
    ...RAW_EMPLOYEE, Salary: 900000, PAN: 'ABCDE1234F', Personal_Mobile: '+910000000000',
  }));
  for (const leaked of ['Salary', '900000', 'PAN', 'ABCDE1234F', 'Personal_Mobile']) {
    assert.equal(json.includes(leaked), false, leaked);
  }
}, 'employee: unknown fields are dropped, including obvious PII');
ok(() => {
  assert.deepEqual(Object.keys(transformEmployeeRecord(RAW_EMPLOYEE)).sort(),
    ['department', 'email', 'employmentTypeId', 'recordId']);
}, 'employee: the output shape is exactly the four mapped fields');
ok(() => {
  const idx = buildEmailIndex([RAW_EMPLOYEE]);
  assert.equal(idx.get('asha.verma@example.test'), '55500000000999');
}, 'employee: the email index is lower-cased, so casing cannot break one person\'s lookup');
ok(() => assert.equal(buildEmailIndex([{ EmailID: 'x@y.z' }]).size, 0), 'employee: a record missing an id is left out of the index, not half-added');
ok(() => assert.equal(transformEmployeeRecord(null), null), 'employee: null input returns null');
// CHANGED in Phase 5.3: the manager field is no longer missing (Reporting_To.ID is observed and
// indexed by the employee directory), but team scope is STILL blocked on live data until E3.
ok(() => {
  assert.ok(EMPLOYEE_GAPS.orgFields.includes('Reporting_To.ID'));
  assert.ok(EMPLOYEE_GAPS.orgFields.includes('NOT yet used for authorization'));
}, 'employee: the manager field is recorded as indexed but not yet used — team scope stays blocked on live data');
ok(() => {
  // Employee_type.id is a FLAT dotted key. Reading it as a nested object would leave the whole
  // column silently empty - nothing would fail, the data would just be gone.
  assert.equal(transformEmployeeRecord(RAW_EMPLOYEE).employmentTypeId, '4200000000021');
  assert.equal(transformEmployeeRecord({ 'Employee_type.id': 7 }).employmentTypeId, '7');
}, 'employee: the flat "Employee_type.id" key is read correctly');
ok(() => {
  const json = JSON.stringify(transformEmployeeRecord(RAW_EMPLOYEE));
  assert.equal(json.includes('Photo'), false);
  assert.equal(json.includes('contacts.zoho.in'), false);
}, 'employee: Photo is dropped, like leave\'s avatar');
ok(() => {
  // End to end from the real body.
  const rows = transformEmployeeRecords(unwrapForms(LIVE_EMPLOYEE_BODY).rows);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    recordId: '55500000000999',
    email: 'Asha.Verma@example.test',
    department: 'Engineering',
    employmentTypeId: '4200000000021',
  });
}, 'employee: real body -> unwrap -> transform yields the normalized shape');
ok(() => {
  // No PII survives the full pipeline, across every record.
  const json = JSON.stringify(transformEmployeeRecords(unwrapForms(LIVE_EMPLOYEE_BODY).rows));
  for (const pii of ['Date_of_birth', '1990', '1992', 'Gender', 'Male', 'Female', 'Photo', 'contacts.zoho.in']) {
    assert.equal(json.includes(pii), false, pii);
  }
}, 'employee: no PII survives the full real-payload pipeline');
ok(() => {
  const idx = buildEmailIndex(unwrapForms(LIVE_EMPLOYEE_BODY).rows);
  assert.equal(idx.size, 3);
  assert.equal(idx.get('neel.joshi@example.test'), '55500000001001');
}, 'employee: the email index builds from the real payload');

// ---------------------------------------------------------------- attendance: pending
ok(() => assert.equal(ATTENDANCE_TRANSFORMER_READY, false), 'attendance: the transformer reports itself as not ready');
throws(() => transformAttendanceRecord({ anything: 1 }), 'attendance: transforming a record REFUSES rather than guessing fields');
ok(() => assert.deepEqual(transformAttendanceRecords([]), []), 'attendance: an empty page is allowed through — that needs no field mapping');
throws(() => transformAttendanceRecords([{ a: 1 }]), 'attendance: a NON-empty page refuses, because mapping it is what does not exist');
ok(() => {
  try { transformAttendanceRecord({}); } catch (e) {
    assert.equal(e.status, 501);
    assert.equal(e.pending, true);
    // 501 not 500: a capability that does not exist yet is not a fault.
    assert.ok(e.message.includes('Do not guess'));
  }
}, 'attendance: the refusal is a 501 with an actionable message');
ok(() => assert.ok(ATTENDANCE_TODO.granularity.includes('check-in')), 'attendance: the day-vs-punch question is recorded');
ok(() => assert.ok(ATTENDANCE_TODO.volume.includes('8,600')), 'attendance: the row-volume concern is recorded');

// ---------------------------------------------------------------- live sources
const stubClient = (rows = []) => ({
  leaves: async () => rows,
  employees: async () => [],
  attendanceEntries: async () => [],
});

await (async () => {
  const live = buildLiveSources({ client: stubClient([RAW_LEAVE]) });
  // Same contract as the seed source: a dashboard saved against one must resolve against the other.
  for (const key of ['leave', 'attendance', 'employees']) {
    assert.deepEqual(live[key].group, SOURCES[key].group, key);
    assert.deepEqual(live[key].numeric, SOURCES[key].numeric, key);
  }
  assert.equal(live.employees.adminOnly, true);
  assert.equal(live.employees.scope, null);
  n++; console.log('ok   live sources: identical contract to the seed sources');
})();

await (async () => {
  const live = buildLiveSources({ client: stubClient([RAW_LEAVE]) });
  const rows = await live.leave.fetchRows({ user: { employeeId: '55500000000999' } });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].days, 1.5);
  n++; console.log('ok   live sources: leave fetches and transforms into engine-ready rows');
})();

await (async () => {
  const live = buildLiveSources({ client: stubClient([]) });
  await assert.rejects(() => live.attendance.fetchRows({ user: { employeeId: 'E1' } }), (e) => e.pending === true);
  n++; console.log('ok   live sources: attendance refuses rather than reporting zero hours');
})();

// ---------------------------------------------------------------- live tools
await (async () => {
  const live = buildLiveTools({ client: stubClient([RAW_LEAVE]) });
  // The contract must not drift between the two implementations.
  assert.deepEqual(Object.keys(live).sort(), Object.keys(PEOPLE_TOOLS).sort());
  for (const [name, tool] of Object.entries(live)) {
    assert.equal(tool.scope, PEOPLE_TOOLS[name].scope, name);
    assert.deepEqual(Object.keys(tool.params), Object.keys(PEOPLE_TOOLS[name].params), name);
    assert.equal(tool.label, PEOPLE_TOOLS[name].label, name);
    assert.equal(tool.say, PEOPLE_TOOLS[name].say, name);
  }
  n++; console.log('ok   live tools: same names, scopes, params and say() as the seed tools');
})();

await (async () => {
  const live = buildLiveTools({ client: stubClient([RAW_LEAVE]) });
  const caller = { employeeId: '55500000000999', role: 'employee' };
  const d = await live['zohoPeople.leaveRecords'].run({}, caller);
  assert.equal(d.employeeId, '55500000000999');
  // say() still writes the sentence - the anti-hallucination guarantee is unchanged by the data
  // arriving over a network.
  assert.ok(/leave record/.test(PEOPLE_TOOLS['zohoPeople.leaveRecords'].say(d)));
  n++; console.log('ok   live tools: a live tool result is still narrated by say()');
})();

await (async () => {
  // Authorization sits below routing for the live tools too.
  const live = buildLiveTools({ client: stubClient([RAW_LEAVE]) });
  await assert.rejects(
    () => live['zohoPeople.leaveRecords'].run({ employeeId: 'SOMEONE_ELSE' }, { employeeId: 'E1', role: 'employee' }),
    (e) => e.status === 403,
  );
  n++; console.log('ok   live tools: an employee still cannot read a colleague (403)');
})();

await (async () => {
  const live = buildLiveTools({ client: stubClient([]) });
  await assert.rejects(
    () => live['zohoPeople.attendanceSummary'].run({}, { employeeId: 'E1', role: 'employee' }),
    (e) => e.pending === true,
  );
  n++; console.log('ok   live tools: attendance refuses while its transformer is pending');
})();

// ---- headcount and employeeLookup against live-shaped fixture data ----
const liveEmployeeClient = () => ({
  leaves: async () => [],
  employees: async () => unwrapForms(LIVE_EMPLOYEE_BODY).rows,
  attendanceEntries: async () => [],
});

await (async () => {
  const live = buildLiveTools({ client: liveEmployeeClient() });
  const d = await live['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN);
  assert.equal(d.total, 3);
  assert.deepEqual(d.groups, [{ name: 'Engineering', value: 2 }, { name: 'People', value: 1 }]);
  assert.equal(d.groupBy, 'department');
  assert.equal(d.downgraded, false);
  // say() still writes the sentence.
  assert.ok(/3 employees by department/.test(PEOPLE_TOOLS['zohoPeople.headcount'].say(d)));
  n++; console.log('ok   live tools: headcount works against the real employee payload');
})();

await (async () => {
  // location and designation do not exist on a live employee record. Grouping by either would
  // report one bar labelled "undefined" - a chart that looks like an answer and is not one.
  const live = buildLiveTools({ client: liveEmployeeClient() });
  const d = await live['zohoPeople.headcount'].run({ groupBy: 'location' }, ADMIN);
  assert.equal(d.groupBy, 'department');
  assert.equal(d.requestedGroupBy, 'location');
  assert.equal(d.downgraded, true);
  assert.equal(d.groups.some((g) => g.name === undefined || g.name === 'undefined'), false);
  n++; console.log('ok   live tools: headcount downgrades an unavailable groupBy instead of charting undefined');
})();

await (async () => {
  // Run as the HR admin. This used to run as MANAGER_LIVE and expect to find neel — a record
  // outside that manager's reporting line. That expectation WAS the organisation-wide lookup leak
  // (G2), so it moved to the admin, who may search everyone; the manager's view is asserted below.
  const live = buildLiveTools({ client: liveEmployeeClient() });
  const d = await live['zohoPeople.employeeLookup'].run({ name: 'neel' }, ADMIN);
  assert.equal(d.count, 1);
  assert.equal(d.employees[0].employeeId, '55500000001001');
  assert.equal(d.employees[0].department, 'People');
  assert.equal(d.matchedOn, 'email');
  assert.ok(PEOPLE_TOOLS['zohoPeople.employeeLookup'].say(d).includes('People'));
  n++; console.log('ok   live tools: employeeLookup works against the real employee payload');
})();

await (async () => {
  const live = buildLiveTools({ client: liveEmployeeClient() });
  const d = await live['zohoPeople.employeeLookup'].run({ name: 'nobody-here' }, ADMIN);
  assert.equal(d.count, 0);
  assert.ok(/Nobody matching/.test(PEOPLE_TOOLS['zohoPeople.employeeLookup'].say(d)));
  n++; console.log('ok   live tools: a lookup miss is an honest empty result');
})();

// ---- team hierarchy is disabled in live mode, and fails CLOSED ----
ok(() => {
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  assert.equal(m.directory.hierarchyAvailable, false);
  // No manager field was observed, so there is nothing to build a reporting line from. Leaving
  // the seed's relationships wired up would mean deciding a real authorization question from
  // generated demo data.
  assert.equal(m.directory.byId('E1002'), null);
}, 'live: the reporting hierarchy is switched off, not backed by seed relationships');
ok(() => {
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  // The live directory is a spread of the seed one. Without an explicit override the SEED's
  // reportsOf would ride along into live mode and decide real team scope from demo data.
  assert.deepEqual(m.directory.reportsOf('E1003'), []);
  assert.ok(seedDirectory.reportsOf('E1003').length > 0);
}, 'live: the seed reporting line does not leak into the live directory');

// ---------------------------------------------------------------- live tool authorization
// Same rules as the seed tools (tests/check.mjs), against the live bodies. Leave rows here carry
// seed ids as employee.zoho_id so the seed reporting line can decide them; the live-directory
// cases below swap the directory to prove live mode fails closed.
const leaveRow = (zohoId, name) => ({ ...RAW_LEAVE, leave_id: `L-${zohoId}`, employee: { ...RAW_LEAVE.employee, zoho_id: zohoId, name } });
const TEAM_LEAVE = [leaveRow('E1001', 'Alex Mathew'), leaveRow('E1049', 'Not Rohits'), leaveRow('E1004', 'Meera Iyer')];
const ON_LEAVE_DAY = () => new Date('2026-09-02T09:00:00Z');
const counting = (rows, empRows = []) => {
  const calls = { leaves: 0, employees: 0 };
  return {
    calls,
    client: {
      leaves: async () => { calls.leaves++; return rows; },
      employees: async () => { calls.employees++; return empRows; },
      attendanceEntries: async () => [],
    },
  };
};
/** Run `fn` with the LIVE directory installed, as it is when NEUIQ_DATA_SOURCE=zoho. */
const withLiveDirectory = async (fn) => {
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  setDirectory(m.directory);
  try { return await fn(); } finally { setDirectory(seedDirectory); }
};

await (async () => {
  for (const [name, tool] of Object.entries(buildLiveTools({ client: stubClient() }))) {
    assert.equal(tool.subjectRows, PEOPLE_TOOLS[name].subjectRows, name);
  }
  n++; console.log('ok   live tools: same subjectRows as the seed tools, so results are checked identically');
})();

await (async () => {
  const live = buildLiveTools({ client: counting(TEAM_LEAVE).client, now: ON_LEAVE_DAY });
  const d = await live['zohoPeople.teamOnLeave'].run({}, MANAGER_LIVE);
  // data_select=ALL returned three people; rohit may see one of them.
  assert.deepEqual(d.people.map((p) => p.employeeId), ['E1001']);
  n++; console.log('ok   live teamOnLeave: an org-wide (data_select=ALL) response is cut to the manager\'s reports');
})();

await (async () => {
  const live = buildLiveTools({ client: counting(TEAM_LEAVE).client, now: ON_LEAVE_DAY });
  const d = await live['zohoPeople.teamOnLeave'].run({}, ADMIN);
  assert.deepEqual(d.people.map((p) => p.employeeId).sort(), ['E1001', 'E1004', 'E1049']);
  for (const p of d.people) assert.deepEqual(Object.keys(p), ON_LEAVE_FIELDS);
  assert.equal(JSON.stringify(d).includes('avatar'), false);
  n++; console.log('ok   live teamOnLeave: an HR admin sees everyone, in exactly the allow-listed fields');
})();

await (async () => {
  const live = buildLiveTools({ client: liveEmployeeClient() });
  // neel's live record is outside the manager's line: found by the admin above, not here.
  const d = await live['zohoPeople.employeeLookup'].run({ name: 'neel' }, MANAGER_LIVE);
  assert.equal(d.count, 0);
  const all = await live['zohoPeople.employeeLookup'].run({ name: 'example.test' }, ADMIN);
  for (const e of all.employees) assert.deepEqual(Object.keys(e), PERSON_FIELDS);
  n++; console.log('ok   live employeeLookup: a manager cannot search outside their line; results are allow-listed');
})();

await withLiveDirectory(async () => {
  // Live mode has no confirmed reporting field. A manager's team is unknown, so team questions
  // are REFUSED — and refused before Zoho is asked, so no org-wide read is even made.
  const { client, calls } = counting(TEAM_LEAVE, unwrapForms(LIVE_EMPLOYEE_BODY).rows);
  const live = buildLiveTools({ client, now: ON_LEAVE_DAY });
  await assert.rejects(() => live['zohoPeople.teamOnLeave'].run({}, MANAGER_LIVE), (e) => e.status === 403);
  await assert.rejects(() => live['zohoPeople.employeeLookup'].run({ name: 'a' }, MANAGER_LIVE), (e) => e.status === 403);
  assert.deepEqual(calls, { leaves: 0, employees: 0 });
  n++; console.log('ok   live mode: a manager\'s team questions are 403, with no Zoho request made');
});

await withLiveDirectory(async () => {
  // Fail closed means exactly the undecidable case: self and admin reads still work.
  const { client } = counting(TEAM_LEAVE);
  const live = buildLiveTools({ client, now: ON_LEAVE_DAY });
  const own = await live['zohoPeople.leaveRecords'].run({}, { employeeId: 'E1001', role: 'employee' });
  assert.equal(own.count, 1);
  await assert.rejects(() => live['zohoPeople.leaveRecords'].run({ employeeId: 'E1001' }, MANAGER_LIVE), (e) => e.status === 403);
  const admin = await live['zohoPeople.teamOnLeave'].run({}, ADMIN);
  assert.equal(admin.people.length, 3);
  n++; console.log('ok   live mode: self and HR-admin reads still work while team reads fail closed');
});
ok(() => {
  const m = buildPeopleManifest({});
  assert.notEqual(m.directory.byId('E1002'), null);
}, 'seed: the seed directory keeps its reporting line');

// ---------------------------------------------------------------- manifest wiring
ok(() => {
  const m = buildPeopleManifest({});
  assert.equal(m.dataSource, 'seed');
  assert.equal(m.sources, SOURCES.leave ? m.sources : m.sources);
  assert.equal(m.tools['zohoPeople.headcount'].scope, 'admin');
}, 'manifest: defaults to the seed with the seed tools');
throws(
  () => buildPeopleManifest({ NEUIQ_DATA_SOURCE: 'zoho' }),
  'manifest: zoho selected without OAuth configured REFUSES AT BOOT, not on first request',
);

// ---------------------------------------------------------------- required data centre (E2.2A-1, S2)
const LIVE_CREDS = { ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c' };
ok(() => {
  for (const missing of [{}, { ZOHO_DC: '' }, { ZOHO_DC: '   ' }, { ZOHO_DC: null }]) {
    assert.throws(() => resolveZohoDc(missing), /ZOHO_DC is required when NEUIQ_DATA_SOURCE=zoho — there is no default/);
  }
  for (const bad of ['xx', 'india', 'us', 'com.au', 'zoho.com']) {
    assert.throws(() => resolveZohoDc({ ZOHO_DC: bad }), /unknown data centre/, bad);
  }
  // A credential pasted into ZOHO_DC is clipped, never echoed whole.
  const pasted = '1000.SECRETVALUE_SHOULD_NOT_APPEAR_1234567890';
  assert.throws(() => resolveZohoDc({ ZOHO_DC: pasted }), (e) => !e.message.includes(pasted) && !e.message.includes('SHOULD_NOT_APPEAR'));
  assert.equal(resolveZohoDc({ ZOHO_DC: ' COM ' }).code, 'com');
  assert.equal(resolveZohoDc({ ZOHO_DC: 'in' }).code, 'in');
}, 'S2: ZOHO_DC is required for live Zoho — missing, blank and unknown values refuse; nothing defaults to India');
ok(() => {
  assert.throws(() => buildPeopleManifest({ NEUIQ_DATA_SOURCE: 'zoho', ...LIVE_CREDS }), /ZOHO_DC is required/);
  assert.throws(() => buildPeopleManifest({ NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'xx', ...LIVE_CREDS }), /unknown data centre/);
  const m = buildPeopleManifest({ NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ...LIVE_CREDS });
  assert.equal(m.dataSource, 'zoho');
  // Seed ignores ZOHO_DC entirely — the local dev .env carries one and must keep working.
  assert.equal(buildPeopleManifest({ ZOHO_DC: 'xx' }).dataSource, 'seed');
}, 'S2: a live manifest refuses without a valid ZOHO_DC; a seed manifest ignores it');
ok(() => {
  assert.deepEqual(zohoPeopleEnvironmentCheck({ ZOHO_DC: 'xx' }, { dataSource: 'seed' }), {}, 'seed: nothing required');
  assert.deepEqual(zohoPeopleEnvironmentCheck({ ZOHO_DC: 'com' }, { dataSource: 'zoho' }),
    { zohoDc: 'com', partition: 'zoho-com', credentialFingerprint: null });
  assert.throws(() => zohoPeopleEnvironmentCheck({}, { dataSource: 'zoho' }), /ZOHO_DC is required/);
  // The DC code, the partition and a truncated hash — never a host, a client id or a secret.
  const clientId = '1000.CLIENTID_SENTINEL_XYZ';
  const r = zohoPeopleEnvironmentCheck({ ZOHO_DC: 'com', ZOHO_CLIENT_ID: clientId, ZOHO_CLIENT_SECRET: 'SECRET_SENTINEL', ZOHO_REFRESH_TOKEN: 'REFRESH_SENTINEL' }, { dataSource: 'zoho' });
  assert.deepEqual(Object.keys(r).sort(), ['credentialFingerprint', 'partition', 'zohoDc']);
  assert.match(r.credentialFingerprint, /^[0-9a-f]{16}$/);
  for (const leak of ['CLIENTID_SENTINEL', 'SECRET_SENTINEL', 'REFRESH_SENTINEL']) assert.equal(JSON.stringify(r).includes(leak), false, leak);
  const other = zohoPeopleEnvironmentCheck({ ZOHO_DC: 'com', ZOHO_CLIENT_ID: '1000.OTHER_CLIENT' }, { dataSource: 'zoho' });
  assert.notEqual(other.credentialFingerprint, r.credentialFingerprint, 'other credentials, other fingerprint');
  const otherDc = zohoPeopleEnvironmentCheck({ ZOHO_DC: 'in', ZOHO_CLIENT_ID: clientId }, { dataSource: 'zoho' });
  assert.notEqual(otherDc.credentialFingerprint, r.credentialFingerprint, 'same client id on another DC is another binding');
}, 'S2: the Zoho startup check returns the DC, its partition and a credential fingerprint — never a credential; live data only');
ok(() => {
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  assert.equal(m.dataSource, 'zoho');
  assert.ok(m.client);
  // Same keys either way, so nothing above the manifest knows which is active.
  assert.deepEqual(Object.keys(m.sources).sort(), ['attendance', 'employees', 'leave']);
  assert.deepEqual(Object.keys(m.tools).sort(), Object.keys(PEOPLE_TOOLS).sort());
}, 'manifest: configured zoho builds live sources and tools with identical keys');

// ---------------------------------------------------------------- runQueryAsync + scope assertion
await (async () => {
  // The async path must produce exactly what the sync path does on the seed.
  const spec = { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days' };
  assert.deepEqual(await runQueryAsync(spec, ADMIN), runQuery(spec, ADMIN));
  n++; console.log('ok   engine: runQueryAsync matches runQuery exactly on seed sources');
})();
await (async () => {
  await assert.rejects(
    () => runQueryAsync({ source: 'employees', groupBy: 'department' }, EMPLOYEE),
    (e) => e.status === 403,
  );
  n++; console.log('ok   engine: the async path refuses an admin-only source with 403');
})();
ok(() => {
  // THE misconfiguration that can actually happen: a source with no scope and no adminOnly flag
  // is read in full by every caller, because there is nothing to pin it with and nothing to
  // refuse it. Refused at registration rather than discovered in production.
  assert.throws(
    () => registerSources({ __unscoped: { label: 'x', group: ['a'], numeric: ['b'], scope: null } }),
    /no scope function and is not adminOnly/,
  );
  assert.equal(SOURCES.__unscoped, undefined);
}, 'engine: a source that is neither scopeable nor admin-only is REFUSED at registration');
ok(() => {
  // The two legal shapes both register.
  registerSources({
    __scoped: { label: 'x', group: ['a'], numeric: ['b'], scope: (id) => ({ field: 'employeeId', op: 'eq', value: id }), rows: () => [] },
    __adminOnly: { label: 'y', group: ['a'], numeric: ['b'], scope: null, adminOnly: true, rows: () => [] },
  });
  assert.ok(SOURCES.__scoped && SOURCES.__adminOnly);
}, 'engine: scopeable and admin-only sources both register');

await (async () => {
  // The post-query tripwire. Unreachable while `eq` is strict equality — the filter and the check
  // derive the same clause — so it is exercised here with a scope that changes between the two
  // calls, standing in for a future refactor that lets the two disagree. With data_select=ALL
  // there is no second fence behind our filter, so this must fail loudly rather than serve.
  let call = 0;
  registerSources({
    __drifting: {
      label: 'Drifting', group: ['month'], numeric: ['days'],
      scope: () => ({ field: 'employeeId', op: 'eq', value: call++ === 0 ? 'SOMEONE_ELSE' : 'E1001' }),
      fetchRows: async () => [{ employeeId: 'SOMEONE_ELSE', days: 5, month: '2026-09' }],
    },
  });
  await assert.rejects(
    () => runQueryAsync({ source: '__drifting', metric: 'count' }, EMPLOYEE),
    (e) => e.status === 500 && /Scoping check failed/.test(e.message),
  );
  n++; console.log('ok   engine: a row that survives filtering but fails the scope check is caught, not served');
})();

// ---------------------------------------------------------------- leave status (Step 11.6)
// Zoho disagrees with itself on casing (upper-case filter values, title-case sample response) and
// live data sent an undocumented NO_STATUS. Only APPROVED is approved leave.
const STATUS_CASES = [
  // [raw, normalised, approved?]
  ['APPROVED', 'Approved', true], ['Approved', 'Approved', true], ['approved', 'Approved', true], [' Approved ', 'Approved', true],
  ['PENDING', 'Pending', false], ['Pending', 'Pending', false],
  ['REJECTED', 'Rejected', false], ['Rejected', 'Rejected', false],
  ['CANCELLED', 'Cancelled', false], ['Cancelled', 'Cancelled', false],
  ['CANCEL_PENDING', 'Cancellation pending', false], ['Cancel Pending', 'Cancellation pending', false], ['cancel-pending', 'Cancellation pending', false],
  ['NO_STATUS', 'No status', false], ['No Status', 'No status', false], ['no_status', 'No status', false],
];
ok(() => {
  for (const [raw, want, approved] of STATUS_CASES) {
    assert.equal(normaliseLeaveStatus(raw), want, raw);
    assert.equal(isApprovedLeave(raw), approved, raw);
    assert.equal(isApprovedLeave({ status: raw }), approved, `row ${raw}`);
  }
}, 'status: every documented and observed value maps case-insensitively, upper and title case alike');
ok(() => {
  const approved = STATUS_CASES.filter(([, , a]) => a).map(([, w]) => w);
  assert.deepEqual([...new Set(approved)], ['Approved']);
  // The two that are tempting to count, explicitly.
  assert.equal(isApprovedLeave('NO_STATUS'), false);
  assert.equal(isApprovedLeave('CANCEL_PENDING'), false);
}, 'status: ONLY APPROVED is approved leave — not NO_STATUS, not CANCEL_PENDING');
ok(() => {
  for (const raw of ['ON_HOLD', 'APPROVED_BY_HR', 'Approve', 'yes', '1']) {
    assert.equal(normaliseLeaveStatus(raw), LEAVE_STATUS.UNRECOGNISED, raw);
    assert.equal(isApprovedLeave(raw), false, raw);
  }
  assert.equal(normaliseLeaveStatus(1), LEAVE_STATUS.UNRECOGNISED);
  assert.equal(normaliseLeaveStatus({ s: 'APPROVED' }), LEAVE_STATUS.UNRECOGNISED);
  const r = transformLeaveRecord({ ...RAW_LEAVE, approval_status: 'ON_HOLD' });
  assert.equal(r.status, LEAVE_STATUS.UNRECOGNISED);
  assert.equal(r.statusRaw, 'ON_HOLD');
}, 'status: an unknown value is Unrecognised, never approved, and its raw value survives');
ok(() => {
  for (const raw of [null, undefined, '', '   ']) {
    assert.equal(normaliseLeaveStatus(raw), null, String(raw));
    assert.equal(isApprovedLeave(raw), false, String(raw));
  }
  const { approval_status: _drop, ...noStatus } = RAW_LEAVE;
  const r = transformLeaveRecord(noStatus);
  assert.equal(r.status, null);
  assert.equal(r.statusRaw, null);
  assert.equal(isApprovedLeave(r), false);
}, 'status: a missing status is null — distinct from NO_STATUS — and not approved');
ok(() => {
  for (const [raw] of [...STATUS_CASES, ['ON_HOLD']]) {
    const once = normaliseLeaveStatus(raw);
    assert.equal(normaliseLeaveStatus(once), once, raw);
  }
}, 'status: normalising is idempotent, so seed rows and live rows need no special case');
ok(() => {
  for (const s of LEAVE_STATUSES) assert.equal(normaliseLeaveStatus(s), s, s);
  for (const s of LEAVE_STATUSES) assert.ok(Object.values(LEAVE_STATUS).includes(s), s);
}, 'status: the seed already speaks the normalised vocabulary (contract)');
ok(() => {
  const rows = [
    { status: 'Approved', statusRaw: 'APPROVED' }, { status: 'No status', statusRaw: 'NO_STATUS' },
    { status: 'Unrecognised', statusRaw: 'ON_HOLD' }, { status: 'Unrecognised', statusRaw: 'FROZEN' },
  ];
  const q = (s) => rows.filter((r) => matchesLeaveStatus(r, s)).map((r) => r.statusRaw);
  assert.deepEqual(q('approved'), ['APPROVED']);
  assert.deepEqual(q('APPROVED'), ['APPROVED']);
  assert.deepEqual(q('no status'), ['NO_STATUS']);
  // An unknown query must not match every Unrecognised row — only the raw value asked for.
  assert.deepEqual(q('on_hold'), ['ON_HOLD']);
  assert.deepEqual(q('nonsense'), []);
  assert.equal(q(undefined).length, 4);
}, 'status: a status query matches normalised values, and an unknown query matches only its raw value');

// Live tools, with live-shaped (upper-case) statuses. Leave type 'Casual' so the balance table
// has a key to count against; 1.5 days per row (RAW_LEAVE's breakdown).
const statusRow = (zohoId, status, leaveId) => ({
  ...RAW_LEAVE, leave_id: leaveId, approval_status: status,
  leave_type: { ...RAW_LEAVE.leave_type, name: 'Casual' },
  employee: { ...RAW_LEAVE.employee, zoho_id: zohoId },
});
const MIXED = [
  statusRow('E1001', 'APPROVED', 'S1'), statusRow('E1001', 'NO_STATUS', 'S2'),
  statusRow('E1001', 'PENDING', 'S3'), statusRow('E1001', 'CANCEL_PENDING', 'S4'),
  statusRow('E1002', 'Approved', 'S5'), statusRow('E1049', 'APPROVED', 'S6'),
];

await (async () => {
  const live = buildLiveTools({ client: counting(MIXED).client, now: ON_LEAVE_DAY });
  const rohit = await live['zohoPeople.teamOnLeave'].run({}, MANAGER_LIVE);
  // E1001 and E1002 are rohit's reports; E1049 is not. Only APPROVED rows, only reports.
  assert.deepEqual(rohit.people.map((p) => p.employeeId).sort(), ['E1001', 'E1002']);
  const admin = await live['zohoPeople.teamOnLeave'].run({}, ADMIN);
  assert.deepEqual(admin.people.map((p) => p.employeeId).sort(), ['E1001', 'E1002', 'E1049']);
  n++; console.log('ok   status live teamOnLeave: upper- and title-case APPROVED both count; other statuses do not; team scoping unchanged');
})();

await (async () => {
  const live = buildLiveTools({ client: counting(MIXED).client, now: ON_LEAVE_DAY });
  const me = { employeeId: 'E1001', role: 'employee' };
  assert.equal((await live['zohoPeople.leaveRecords'].run({ status: 'approved' }, me)).count, 1);
  assert.equal((await live['zohoPeople.leaveRecords'].run({ status: 'No status' }, me)).count, 1);
  const all = await live['zohoPeople.leaveRecords'].run({}, me);
  assert.equal(all.count, 4);
  assert.deepEqual(all.records.map((r) => r.status).sort(), ['Approved', 'Cancellation pending', 'No status', 'Pending']);
  // Scoping unchanged: an employee still cannot read a colleague.
  await assert.rejects(() => live['zohoPeople.leaveRecords'].run({ employeeId: 'E1002' }, me), (e) => e.status === 403);
  n++; console.log('ok   status live leaveRecords: status filters match live values; records carry normalised labels; scoping unchanged');
})();

await (async () => {
  // Analytics, through the real engine: the pending figure the summary reads.
  const live = buildLiveSources({
    client: stubClient([...MIXED, statusRow('E1002', 'Pending', 'S7')]),
    now: () => new Date('2026-09-02T00:00:00Z'),   // a window no earlier test cached
  });
  registerSources({ __liveStatusLeave: live.leave });
  const byStatus = (await runQueryAsync({ source: '__liveStatusLeave', groupBy: 'status', metric: 'count' }, ADMIN)).data;
  assert.equal(countWithStatus(byStatus, LEAVE_STATUS.PENDING), 2);          // 'PENDING' + 'Pending'
  assert.equal(countWithStatus(byStatus, 'pending'), 2);
  assert.equal(countWithStatus(byStatus, LEAVE_STATUS.APPROVED), 3);
  assert.equal(countWithStatus(byStatus, LEAVE_STATUS.NO_STATUS), 1);
  assert.equal(byStatus.some((g) => /^[A-Z_]+$/.test(g.name)), false);      // no raw upper-case buckets
  // Scoping still applies to the same query for an employee.
  const mine = (await runQueryAsync({ source: '__liveStatusLeave', groupBy: 'status', metric: 'count' }, { employeeId: 'E1002', role: 'employee' })).data;
  assert.equal(countWithStatus(mine, LEAVE_STATUS.PENDING), 1);
  assert.equal(countWithStatus(mine, LEAVE_STATUS.APPROVED), 1);
  n++; console.log('ok   status analytics: live PENDING/Pending both reach the pending-approvals count, per caller scope');
})();

ok(() => {
  assert.equal(countWithStatus([], LEAVE_STATUS.PENDING), 0);
  assert.equal(countWithStatus(null, LEAVE_STATUS.PENDING), 0);
  assert.equal(countWithStatus([{ name: 'Approved', value: 3 }], LEAVE_STATUS.PENDING), 0);
}, 'status analytics: no pending group reads as 0, not a throw');

// ---------------------------------------------------------------- leave balance (Step 11.8)
// Zoho's Booked and Balance report replaces the invented entitlement table. Everything here is
// mocked: requests go through the real people client, shared client, precision parser, limiter,
// transformer and tool, with fetch answering from fixtures. Synthetic ids throughout.
const EMP = BIG_RECORD;
const OTHER_EMP = BIG_OTHER;
const MGR_ID = '555000000099999991';
const ADMIN_ID = '555000000099999992';
const T_PERSONAL = '555000000000200001';
const T_VACATION = '555000000000200002';
const T_FMLA = '555000000000200003';
const SELF_U = { employeeId: EMP, role: 'employee' };
const MGR_U = { employeeId: MGR_ID, role: 'manager' };
const ADMIN_U = { employeeId: ADMIN_ID, role: 'hr_admin' };
const OCT13 = new Date('2026-10-13T09:00:00Z');

// Shaped exactly as observed 2026-10-13. `employees` holds an UNQUOTED 18-digit number here on
// purpose: if precision were lost it would no longer equal EMP and the scope check would refuse.
const babText = ({ report, employees = `[${EMP}]` } = {}) => `{
  "leavetypes": {
    "${T_PERSONAL}": {"unit":"Day","code":"PL","name":"Personal Leave","type":"UNPAID"},
    "${T_VACATION}": {"unit":"Day","code":"VAC","name":"Vacation","type":"UNPAID"},
    "${T_FMLA}":     {"unit":"Day","code":"FMLA","name":"Family and Medical Leave (FMLA)","type":"PAID"}
  },
  "report": ${report ?? `{
    "${EMP}": {
      "${T_PERSONAL}": {"balance": 4, "booked": 1},
      "${T_VACATION}": {"balance": 10},
      "${T_FMLA}":     {"balance": 12.5, "booked": 0},
      "totals": {"unpaidBooked": 1, "unpaidBalance": 14, "paidBalance": 12.5, "paidBooked": 0},
      "employee": {"name": "Test Person", "id": "AB123"}
    }
  }`},
  "employees": ${employees}
}`;
const babBody = (opts) => parseZohoJson(babText(opts));

/** A people client whose fetch answers from a queue of [status, text]; counts every request. */
function balanceRig({ queue = [], now = () => OCT13.getTime(), limiter } = {}) {
  const calls = [];
  const lines = [];
  const client = createPeopleClient({
    dc: 'com', tokenProvider: stubProvider(),
    logger: { log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) },
    balanceLimiter: limiter ?? createRateLimiter({ name: 'test balance', ...BALANCE_RATE_LIMIT, now }),
    fetchImpl: async (url) => {
      calls.push(new URL(url));
      const [status, text] = queue.length ? queue.shift() : [200, babText()];
      return new Response(text, { status, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, calls, lines };
}
const balanceTools = (rig, opts = {}) => {
  // hasOwn, not a default parameter: `leaveYearStart: undefined` must mean UNSET, not '01-01'.
  const leaveYearStart = Object.hasOwn(opts, 'leaveYearStart') ? opts.leaveYearStart : '01-01';
  const now = opts.now ?? (() => OCT13);
  return buildLiveTools({
    client: rig.client, now, leaveYearStart, balanceCache: createCache({ now: opts.cacheNow ?? (() => now().getTime()) }),
  });
};
/** A directory where MGR_ID manages EMP only — digit ids, as live __recordIds are. */
const withDigitDirectory = async (fn) => {
  setDirectory({ hierarchyAvailable: true, reportsOf: (id) => (id === MGR_ID ? [EMP] : []), byId: () => null });
  try { return await fn(); } finally { setDirectory(seedDirectory); }
};
const reason = async (p) => { try { await p; return 'resolved'; } catch (e) { return e.code ?? e.status ?? e.name; } };

// -- ids and period policy --
ok(() => {
  for (const good of [EMP, '123456']) assert.equal(isZohoRecordId(good), true, good);
  for (const bad of ['E1001', 'a@example.test', JSON.parse(EMP), 12345678, '12345', ` ${EMP}`, `${EMP},${OTHER_EMP}`,
    `["${EMP}"]`, '*', '', null, undefined, [EMP], { id: EMP }]) {
    assert.equal(isZohoRecordId(bad), false, String(bad));
  }
}, 'balance ids: only a digit-string erecno is accepted — not a seed id, email, number, list or wildcard');
ok(() => {
  assert.deepEqual(parseLeaveYearStart('04-01'), { month: 4, day: 1 });
  for (const bad of [undefined, '', '4-1', '13-01', '00-10', '04-31', '02-29', '2026-04-01', 'april']) {
    assert.equal(parseLeaveYearStart(bad), null, String(bad));
    assert.equal(leaveBalancePeriod(bad, OCT13), null, String(bad));
  }
}, 'balance period: an unset or invalid leave-year start yields NO period (02-29 included)');
ok(() => {
  const cal = leaveBalancePeriod('01-01', OCT13);
  assert.deepEqual([cal.from, cal.to, cal.asOf], ['2026-01-01', '2026-10-13', '2026-10-13']);
  const fy = leaveBalancePeriod('04-01', OCT13);
  assert.equal(fy.from, '2026-04-01');
  const early = leaveBalancePeriod('04-01', new Date('2026-02-01T00:00:00Z'));
  assert.deepEqual([early.from, early.to], ['2025-04-01', '2026-02-01']);
  assert.equal(leaveBalancePeriod('10-13', OCT13).from, '2026-10-13');       // start day itself
  assert.ok(/not confirmed/.test(cal.unconfirmed) && /not a statement of entitlement/.test(cal.unconfirmed));
}, 'balance period: configured leave year to date, labelled with its unconfirmed semantics');

// -- transformer --
ok(() => {
  const rows = transformLeaveBalanceReport(babBody(), { employeeId: EMP });
  assert.deepEqual(rows.map((r) => r.leaveType), ['Family and Medical Leave (FMLA)', 'Personal Leave', 'Vacation']);
  for (const r of rows) assert.deepEqual(Object.keys(r), BALANCE_FIELDS);
  const vac = rows.find((r) => r.leaveType === 'Vacation');
  assert.equal(vac.booked, null);                    // absent is unknown, not 0
  assert.equal(rows.find((r) => r.leaveType === 'Family and Medical Leave (FMLA)').booked, 0);  // a real 0 stays 0
  assert.deepEqual(rows.map((r) => r.leaveTypeId).sort(), [T_PERSONAL, T_VACATION, T_FMLA].sort());
  assert.deepEqual([...new Set(rows.map((r) => r.category))].sort(), ['PAID', 'UNPAID']);
  const json = JSON.stringify(rows);
  for (const leak of ['Test Person', 'AB123', 'totals', 'unpaidBalance', '"code"', 'employee']) assert.equal(json.includes(leak), false, leak);
}, 'balance transformer: exact allow-listed rows; missing booked is null; names, employee ids, totals and codes dropped');

ok(() => {
  const t = (body, id = EMP) => { try { transformLeaveBalanceReport(body, { employeeId: id }); return 'returned'; } catch (e) { return `${e.code}/${e.status}`; } };
  const R = (inner) => babBody({ report: inner });
  const row = (b) => `{"${EMP}": {"${T_PERSONAL}": ${b}}}`;
  assert.equal(t(babBody(), 'E1001'), 'NOT_LINKED/503');
  assert.equal(t(null), 'MALFORMED/502');
  assert.equal(t({ report: {} }), 'MALFORMED/502');
  assert.equal(t(R('[]')), 'MALFORMED/502');
  assert.equal(t(R(`{"${EMP}": {}, "${OTHER_EMP}": {}}`)), 'SCOPE_MISMATCH/502');
  assert.equal(t(babBody({ employees: `[${EMP}, ${OTHER_EMP}]` })), 'SCOPE_MISMATCH/502');
  assert.equal(t(babBody({ employees: '"x"' })), 'MALFORMED/502');
  assert.equal(t(R('{}')), 'NO_DATA/503');
  assert.equal(t(R(`{"${EMP}": {"totals": {}, "employee": {"name": "x"}}}`)), 'NO_DATA/503');
  assert.equal(t(R(`{"${EMP}": {"999999999": {"balance": 1}}}`)), 'MALFORMED/502');        // unknown leave type
  assert.equal(t(R(row('{"booked": 1}'))), 'MALFORMED/502');                                // balance missing
  assert.equal(t(R(row('{"balance": "4"}'))), 'MALFORMED/502');                             // balance as a string
  assert.equal(t(R(row('{"balance": null}'))), 'MALFORMED/502');
  assert.equal(t(R(row('{"balance": 4, "booked": "1"}'))), 'MALFORMED/502');
  assert.equal(t(R(row('4'))), 'MALFORMED/502');
}, 'balance transformer: every incomplete or out-of-scope report is refused — never trimmed, zeroed or defaulted');

// -- client --
await (async () => {
  const rig = balanceRig();
  await rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' });
  assert.equal(rig.calls.length, 1);
  const u = rig.calls[0];
  assert.equal(u.origin + u.pathname, 'https://people.zoho.com/people/api/v2/leavetracker/reports/bookedAndBalance');
  assert.equal(u.searchParams.get('from'), '01-Jan-2026');
  assert.equal(u.searchParams.get('to'), '13-Oct-2026');
  assert.equal(u.searchParams.get('unit'), 'Day');
  assert.equal(u.searchParams.get('employee'), `["${EMP}"]`);
  assert.deepEqual([...u.searchParams.keys()].sort(), ['employee', 'from', 'to', 'unit']);
  n++; console.log('ok   balance client: one request, .com host, dd-MMM-yyyy dates, unit=Day, exactly one employee');
})();

await (async () => {
  const rig = balanceRig();
  for (const bad of ['E1001', '*', `${EMP},${OTHER_EMP}`, `["${EMP}","${OTHER_EMP}"]`, '', undefined]) {
    await assert.rejects(() => rig.client.leaveBalance({ employeeId: bad, from: '2026-01-01', to: '2026-10-13' }), (e) => e.code === 'NOT_LINKED');
  }
  assert.equal(rig.calls.length, 0);
  n++; console.log('ok   balance client: a missing or unsafe employee id is refused with NO request — no organisation-wide fallback');
})();

await (async () => {
  const rig = balanceRig({ queue: [[500, '{"message":"internal"}']] });
  await assert.rejects(() => rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' }), (e) => e.status === 503);
  assert.equal(rig.calls.length, 1);
  n++; console.log('ok   balance client: HTTP 500 is NOT retried (one request) and surfaces as unavailable');
})();

await (async () => {
  let t = OCT13.getTime();
  const rig = balanceRig({ queue: [[429, '{"message":"rate"}']], now: () => t });
  await assert.rejects(() => rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' }), (e) => e.status === 429);
  assert.equal(rig.calls.length, 1);
  // Locked out locally: refused without a request, with a wait time.
  await assert.rejects(() => rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' }),
    (e) => e.status === 429 && e.code === 'LOCAL_RATE_LIMIT' && e.retryAfterSeconds > 0);
  assert.equal(rig.calls.length, 1);
  t += BALANCE_RATE_LIMIT.lockoutMs + 1;
  await rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' });
  assert.equal(rig.calls.length, 2);
  n++; console.log('ok   balance client: a Zoho 429 locks the endpoint locally for the documented 2 minutes, without further requests');
})();

await (async () => {
  let t = OCT13.getTime();
  const limiter = createRateLimiter({ name: 'test', limit: 3, windowMs: 60_000, lockoutMs: 120_000, now: () => t });
  const rig = balanceRig({ limiter });
  for (let i = 0; i < 3; i++) await rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' });
  await assert.rejects(() => rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' }), (e) => e.status === 429);
  assert.equal(rig.calls.length, 3);
  t += 60_001;
  await rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' });
  assert.equal(rig.calls.length, 4);
  assert.ok(BALANCE_RATE_LIMIT.limit < 30 && BALANCE_RATE_LIMIT.lockoutMs === 120_000);
  n++; console.log('ok   balance client: the local window refuses before Zoho\'s 30 without a request, and reopens after the window');
})();

// -- tool --
await (async () => {
  const rig = balanceRig();
  const tools = balanceTools(rig);
  const d = await tools['zohoPeople.leaveBalance'].run({}, SELF_U);
  assert.equal(d.employeeId, EMP);
  assert.equal(d.dataSource, 'zoho');
  assert.deepEqual([d.period.from, d.period.to, d.period.asOf], ['2026-01-01', '2026-10-13', '2026-10-13']);
  assert.equal(d.balances.length, 3);
  for (const b of d.balances) assert.deepEqual(Object.keys(b), ['leaveType', 'category', 'unit', 'balance', 'booked']);
  for (const leak of ['Test Person', 'AB123', 'entitled', 'remaining', 'taken', 'totals', T_PERSONAL]) {
    assert.equal(JSON.stringify(d).includes(leak), false, leak);
  }
  assert.doesNotThrow(() => assertResultAllowed('zohoPeople.leaveBalance', d, SELF_U));
  const s = PEOPLE_TOOLS['zohoPeople.leaveBalance'].say(d);
  assert.ok(s.startsWith('Zoho People leave report, 2026-01-01 to 2026-10-13 (as of 2026-10-13)'));
  assert.ok(s.includes('Vacation: 10 days balance, booked not reported'));
  assert.ok(s.includes('Personal Leave: 4 days balance, 1 day booked'));
  assert.ok(/Note: .*not a statement of entitlement/.test(s));
  // No entitlement wording: not "entitled to", not "days left", not the seed's "4 of 12 days".
  assert.equal(/entitle(d|ment) to|days left|\d of \d+(\.\d+)? days?/.test(s.replace(/not a statement of entitlement/, '')), false);
  n++; console.log('ok   balance tool: Zoho figures for a labelled period, allow-listed, no entitlement implied, and it passes the result check');
})();

await (async () => {
  for (const cfg of [undefined, '', '2026-01-01', '02-29', '13-01']) {
    const rig = balanceRig();
    const tools = balanceTools(rig, { leaveYearStart: cfg });
    assert.equal(await reason(tools['zohoPeople.leaveBalance'].run({}, SELF_U)), BALANCE_UNAVAILABLE.PERIOD_NOT_CONFIGURED, String(cfg));
    assert.equal(rig.calls.length, 0, String(cfg));
  }
  n++; console.log('ok   balance tool: no configured leave year -> unavailable, with no request and no guessed period');
})();

await (async () => {
  const rig = balanceRig();
  const tools = balanceTools(rig);
  // A seed-shaped identity (live mode before the identity work) is not a Zoho record.
  assert.equal(await reason(tools['zohoPeople.leaveBalance'].run({}, { employeeId: 'E1001', role: 'employee' })), 'NOT_LINKED');
  assert.equal(await reason(tools['zohoPeople.leaveBalance'].run({}, { employeeId: 'E1004', role: 'hr_admin' })), 'NOT_LINKED');
  assert.equal(rig.calls.length, 0);
  n++; console.log('ok   balance tool: a caller not linked to a Zoho record is unavailable, never someone else\'s balance');
})();

await withDigitDirectory(async () => {
  const rig = balanceRig();
  const tools = balanceTools(rig);
  const run = (args, user) => tools['zohoPeople.leaveBalance'].run(args, user);
  // Employee -> colleague, and every malicious variant: 403 before any request.
  for (const target of [OTHER_EMP, MGR_ID, '*', `${EMP},${OTHER_EMP}`, `["${EMP}","${OTHER_EMP}"]`, 'ALL']) {
    assert.equal(await reason(run({ employeeId: target }, SELF_U)), 403, target);
  }
  // Manager -> someone outside their line.
  assert.equal(await reason(run({ employeeId: OTHER_EMP }, MGR_U)), 403);
  assert.equal(rig.calls.length, 0);
  // Manager -> their report, and admin -> anyone: allowed, each for exactly that employee.
  assert.equal((await run({ employeeId: EMP }, MGR_U)).employeeId, EMP);
  assert.equal((await run({ employeeId: EMP }, ADMIN_U)).employeeId, EMP);
  assert.deepEqual(rig.calls.map((u) => u.searchParams.get('employee')), [`["${EMP}"]`, `["${EMP}"]`]);
  n++; console.log('ok   balance tool: authorisation is decided before any request; chat-supplied ids only select among allowed ones');
});

await withDigitDirectory(async () => {
  let t = OCT13.getTime();
  const rig = balanceRig({ now: () => t });
  const tools = balanceTools(rig, { now: () => new Date(t), cacheNow: () => t });
  const run = (args, user) => tools['zohoPeople.leaveBalance'].run(args, user);
  await run({}, SELF_U);
  await run({}, SELF_U);
  assert.equal(rig.calls.length, 1);                       // same caller, subject, period: cached
  await run({ employeeId: EMP }, MGR_U);
  assert.equal(rig.calls.length, 2);                       // different caller, same subject: not shared
  await run({ employeeId: EMP }, ADMIN_U);
  assert.equal(rig.calls.length, 3);
  t += (BALANCE_TTL_SECONDS + 1) * 1000;
  await run({}, SELF_U);
  assert.equal(rig.calls.length, 4);                       // expired
  n++; console.log('ok   balance tool: cached per caller and subject, never shared between them, and expires');
});

await (async () => {
  // A new leave year is a different question: the period is part of the key.
  let now = new Date('2026-03-31T12:00:00Z');
  const rig = balanceRig();
  const tools = buildLiveTools({ client: rig.client, now: () => now, leaveYearStart: '04-01', balanceCache: createCache() });
  const a = await tools['zohoPeople.leaveBalance'].run({}, SELF_U);
  now = new Date('2026-04-01T12:00:00Z');
  const b = await tools['zohoPeople.leaveBalance'].run({}, SELF_U);
  assert.deepEqual([a.period.from, b.period.from], ['2025-04-01', '2026-04-01']);
  assert.equal(rig.calls.length, 2);
  n++; console.log('ok   balance tool: a new leave year is a new cache entry, never last year\'s figures');
})();

await (async () => {
  const rig = balanceRig({ queue: [[500, '{}'], [200, babText()]] });
  const tools = balanceTools(rig);
  assert.equal(await reason(tools['zohoPeople.leaveBalance'].run({}, SELF_U)), 503);
  const d = await tools['zohoPeople.leaveBalance'].run({}, SELF_U);
  assert.equal(d.balances.length, 3);
  assert.equal(rig.calls.length, 2);                       // the failure was not cached
  n++; console.log('ok   balance tool: an API failure is an error, never figures, and is not cached');
})();

await (async () => {
  const cases = [
    [babText({ report: `{"${EMP}": {}, "${OTHER_EMP}": {}}` }), 'SCOPE_MISMATCH'],
    [babText({ report: '{}' }), 'NO_DATA'],
    [babText({ report: `{"${EMP}": {"${T_PERSONAL}": {"booked": 1}}}` }), 'MALFORMED'],
    ['not json at all', 'MALFORMED'],
  ];
  for (const [text, want] of cases) {
    const rig = balanceRig({ queue: [[200, text], [200, babText()]] });
    const tools = balanceTools(rig);
    assert.equal(await reason(tools['zohoPeople.leaveBalance'].run({}, SELF_U)), want, want);
    // And the refusal was not cached: the next call asks again.
    await tools['zohoPeople.leaveBalance'].run({}, SELF_U);
    assert.equal(rig.calls.length, 2, want);
  }
  n++; console.log('ok   balance tool: other-employee, empty, incomplete and non-JSON reports are refused, not served or cached');
})();

await (async () => {
  const rig = balanceRig();
  const tools = balanceTools(rig);
  const one = await tools['zohoPeople.leaveBalance'].run({ leaveType: 'personal LEAVE' }, SELF_U);
  assert.deepEqual(one.balances.map((b) => b.leaveType), ['Personal Leave']);
  const none = await tools['zohoPeople.leaveBalance'].run({ leaveType: 'Casual' }, SELF_U);
  assert.deepEqual(none.balances, []);
  assert.equal(PEOPLE_TOOLS['zohoPeople.leaveBalance'].say(none), 'Zoho People has no leave type called "Casual" for this employee.');
  assert.equal(rig.calls.length, 1);                       // the filter reads the cached report
  n++; console.log('ok   balance tool: leave type matches Zoho\'s real names case-insensitively; an unknown type says so, with no figure');
})();

await (async () => {
  // Logs across success, refusal and failure: method/path/status metadata only.
  const rig = balanceRig({ queue: [[200, babText()], [200, babText({ report: '{}' })], [500, '{"message":"x"}']] });
  for (let i = 0; i < 3; i++) {
    await rig.client.leaveBalance({ employeeId: EMP, from: '2026-01-01', to: '2026-10-13' }).catch(() => {});
  }
  const logged = rig.lines.join('\n');
  assert.ok(rig.lines.length >= 2);
  for (const leak of [EMP, 'Test Person', 'AB123', 'tok', 'employee=', '%5B']) assert.equal(logged.includes(leak), false, leak);
  n++; console.log('ok   balance logs: no employee id, name, query string or token is logged');
})();

ok(() => {
  // Seed stays seed, and says so; live code carries no invented figures and no seed data.
  const src = readFileSync(new URL('../functions/neuiq_api/src/integrations/zoho/people/tools/live.js', import.meta.url), 'utf8');
  assert.equal(/\bENTITLEMENT\b/.test(src), false);
  assert.equal(/from '\.\.\/(dataset|seed)\.js'/.test(src), false);
  const seedD = PEOPLE_TOOLS['zohoPeople.leaveBalance'].run({}, { employeeId: 'E1001', role: 'employee' });
  assert.equal(seedD.dataSource, 'seed');
  assert.equal(seedD.demo, true);
  assert.ok(PEOPLE_TOOLS['zohoPeople.leaveBalance'].say(seedD).includes('demo data, not from Zoho People'));
}, 'balance isolation: no invented entitlements or seed data in live code; the seed result is labelled demo data');

await (async () => {
  // Wired from configuration at boot: a live manifest with no leave year refuses, offline.
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  assert.equal(await reason(m.tools['zohoPeople.leaveBalance'].run({}, SELF_U)), 'PERIOD_NOT_CONFIGURED');
  n++; console.log('ok   balance manifest: live mode without ZOHO_PEOPLE_LEAVE_YEAR_START refuses rather than assume a year');
})();

// ---------------------------------------------------------------- employee directory (Phase 5.3)
// The identity directory a verified Zoho sign-in will be mapped onto. Recorded-shape fixtures,
// parsed through the real precision-safe parser and forms unwrapper. Synthetic ids and names only.
const R = (n) => `5550000001000000${String(n).padStart(2, '0')}`;     // 18-digit record ids
const ZU = (n) => `7000000${String(n).padStart(2, '0')}`;            // 9-digit ZUIDs
const PII = `"EmailID":"x@example.test","Date_of_birth":"01-Jan-1990","Gender":"Female","Social_Security_Number":"000-00-0000","Role":"Admin","Present_Address":"1 Test Road","Mobile":"0000000000"`;
const rec = (key, f) => `{"${key}":[{${[
  f.zohoId === undefined ? `"Zoho_ID":${key}` : f.zohoId === null ? null : `"Zoho_ID":${f.zohoId}`,
  f.zuid === undefined ? null : `"ZUID":${JSON.stringify(f.zuid)}`,
  f.status === undefined ? null : `"Employeestatus":${JSON.stringify(f.status)}`,
  `"Reporting_To.ID":${JSON.stringify(f.manager ?? '')}`,
  `"FirstName":${JSON.stringify(f.first ?? 'Test')}`, `"LastName":${JSON.stringify(f.last ?? 'Person')}`,
  PII,
].filter(Boolean).join(',')}}]}`;
const DIRECTORY_TEXT = `{"response":{"result":[
  ${rec(R(1), { zuid: ZU(1), status: 'Active', first: 'Ada', last: 'One' })},
  ${rec(R(2), { zuid: ZU(2), status: 'Active', manager: R(1), first: 'Bea', last: 'Two' })},
  ${rec(R(3), { zuid: ZU(3), status: 'Terminated', manager: R(1) })},
  ${rec(R(4), { status: 'Active', manager: R(1) })},
  ${rec(R(5), { zuid: ZU(5) })},
  ${rec(R(6), { zuid: ZU(6), status: 'Active' })},
  ${rec(R(7), { zuid: ZU(6), status: 'Active' })},
  ${rec(R(8), { zuid: ZU(8), status: 'Active', manager: 'not-an-id' })},
  ${rec(R(9), { zuid: ZU(9), status: 'Active', manager: R(9) })},
  ${rec(R(10), { zuid: ZU(10), status: 'Active', manager: '555000000199999999' })},
  ${rec(R(11), { zuid: ZU(11), status: 'Active' })},
  ${rec(R(11), { zuid: ZU(12), status: 'Active' })},
  ${rec(R(13), { zuid: ZU(13), status: 'Active', zohoId: '555000000100000099' })},
  ${rec(R(14), { zuid: ZU(14), status: 'active' })}
],"message":"Data fetched successfully","status":0}}`;
const directoryRows = () => unwrapForms(parseZohoJson(DIRECTORY_TEXT)).rows;

ok(() => {
  assert.equal(exactId(R(1)), R(1));
  assert.equal(exactId(812345678), '812345678');                  // a safe number is exact
  assert.equal(exactId(JSON.parse(R(1))), null, 'an 18-digit number was already rounded');
  for (const bad of ['E1001', '', ' 1', '1.5', '-1', null, undefined, {}, [R(1)], NaN, 1.5]) assert.equal(exactId(bad), null, String(bad));
  // Fixture guard: plain JSON.parse really would corrupt these ids.
  assert.notEqual(String(JSON.parse(R(1))), R(1));
}, 'directory ids: exact digit strings only — an already-rounded 18-digit number is rejected, never String()-ed');

ok(() => {
  const rows = directoryRows();
  const { entry, problems } = transformEmployeeIdentity(rows[0]);
  assert.deepEqual(Object.keys(entry), IDENTITY_FIELDS);
  assert.deepEqual(problems, []);
  assert.equal(entry.recordId, R(1));
  assert.equal(entry.zuid, ZU(1));
  assert.equal(entry.active, true);
  assert.deepEqual([entry.firstName, entry.lastName], ['Ada', 'One']);
  const json = JSON.stringify(rows.map((r) => transformEmployeeIdentity(r).entry));
  for (const leak of ['example.test', '1990', 'Female', '000-00-0000', 'Admin', 'Test Road', '0000000000', 'Role', 'EmailID']) {
    assert.equal(json.includes(leak), false, leak);
  }
}, 'directory transformer: exactly the approved identity fields; email, DOB, gender, SSN, address, phone and Zoho Role are dropped');

ok(() => {
  const idx = buildEmployeeIndex(directoryRows());
  assert.deepEqual({ ...idx.issues }, {
    missing_record_id: 0, record_id_mismatch: 1, duplicate_record_id: 2, missing_zuid: 1, duplicate_zuid: 2,
    invalid_manager: 1, self_manager: 1, unknown_manager: 1,
  });
  assert.equal(idx.counts.received, 14);
  assert.equal(idx.size, 11);                                          // 14 - mismatch - 2 duplicate ids
  assert.equal(idx.byRecordId.has(R(11)), false, 'a duplicated __recordId maps to nobody');
  assert.equal(idx.byRecordId.has(R(13)), false, 'a Zoho_ID disagreeing with the key is excluded');
  for (const [key, e] of idx.byRecordId) { assert.equal(typeof key, 'string'); assert.equal(key, e.recordId); assert.match(key, /^\d{18}$/); }
}, 'directory index: duplicate canonical ids and Zoho_ID mismatches are excluded; every key is the exact 18-digit string');

ok(() => {
  const idx = buildEmployeeIndex(directoryRows());
  assert.equal(idx.byZuid.get(ZU(1)).recordId, R(1));
  assert.equal(idx.byZuid.get(ZU(2)).recordId, R(2));
  assert.equal(idx.byZuid.has(ZU(6)), false, 'a ZUID on two records maps to nobody');
  assert.ok(idx.duplicateZuids.has(ZU(6)));
  assert.equal([...idx.byZuid.values()].some((e) => e.recordId === R(4)), false, 'no ZUID, no sign-in');
}, 'directory index: each ZUID maps to exactly one employee; duplicated or missing ZUIDs map to nobody');

ok(() => {
  const idx = buildEmployeeIndex(directoryRows());
  // Ada (R1) manages Bea (active), R3 (Terminated) and R4 (active, no ZUID): only ACTIVE reports.
  assert.deepEqual([...idx.reports.get(R(1))].sort(), [R(2), R(4)].sort());
  assert.equal(idx.byRecordId.get(R(8)).managerRecordId, null, 'a non-id manager link is dropped');
  assert.equal(idx.byRecordId.get(R(9)).managerRecordId, null, 'a self-manager link is dropped');
  assert.equal(idx.byRecordId.get(R(10)).managerRecordId, null, 'a link to a record not in the directory is dropped');
  assert.equal(idx.reports.has('555000000199999999'), false);
  assert.equal(idx.byRecordId.get(R(2)).managerRecordId, R(1), 'a valid link is kept, exactly');
}, 'directory reporting lines: exact manager __recordIds; invalid, self and unknown managers grant nothing; inactive reports excluded');

await (async () => {
  let loads = 0;
  const dir = createEmployeeDirectory({ loadRecords: async () => { loads++; return directoryRows(); } });
  const ok1 = await dir.resolveZuid(ZU(1));
  assert.equal(ok1.ok, true);
  assert.equal(ok1.employee.recordId, R(1));
  const cases = {
    [ZU(3)]: LOOKUP.INACTIVE,         // Terminated
    [ZU(5)]: LOOKUP.INACTIVE,         // status missing
    [ZU(14)]: LOOKUP.INACTIVE,        // "active" is not "Active"
    [ZU(6)]: LOOKUP.DUPLICATE_ZUID,
    '799999999': LOOKUP.NOT_LINKED,
  };
  for (const [z, reason] of Object.entries(cases)) {
    const r = await dir.resolveZuid(z);
    assert.equal(r.ok, false, z);
    assert.equal(r.reason, reason, z);
    assert.equal('employee' in r, false, `${z}: a refusal carries no employee`);
  }
  assert.equal(loads, 1, 'all served from one snapshot');
  n++; console.log('ok   directory lookup: ZUID -> exactly one ACTIVE employee; inactive, unknown status, duplicate and unlinked are refused with a reason');
})();

await (async () => {
  let loads = 0;
  const dir = createEmployeeDirectory({ loadRecords: async () => { loads++; return directoryRows(); } });
  for (const bad of ['abc', '', null, undefined, JSON.parse(R(1)), 7.5, `${ZU(1)} `, [ZU(1)]]) {
    assert.equal((await dir.resolveZuid(bad)).reason, LOOKUP.INVALID_ID, String(bad));
  }
  assert.equal(loads, 0, 'an invalid id is refused before anything is loaded');
  assert.equal((await dir.getEmployee(R(3))).employee.active, false, 'getEmployee reports inactive employees as inactive');
  assert.equal((await dir.getEmployee(R(11))).reason, LOOKUP.NOT_FOUND);
  assert.deepEqual([...(await dir.reportsOf(R(1))).reports].sort(), [R(2), R(4)].sort());
  assert.deepEqual((await dir.reportsOf(R(2))).reports, []);
  n++; console.log('ok   directory lookup: invalid ids are refused without a load; getEmployee and reportsOf use exact __recordIds');
})();

await (async () => {
  let t = 1_000_000;
  let loads = 0;
  const dir = createEmployeeDirectory({ loadRecords: async () => { loads++; return directoryRows(); }, now: () => t, ttlMs: 60 * 60 * 1000 });
  assert.equal(dir.status().ttlMs, DIRECTORY_MAX_TTL_MS, 'a longer TTL is clamped to five minutes');
  await dir.resolveZuid(ZU(1));
  t += DIRECTORY_MAX_TTL_MS - 1;
  await dir.resolveZuid(ZU(1));
  assert.equal(loads, 1);
  t += 2;
  await dir.resolveZuid(ZU(1));
  assert.equal(loads, 2, 'expired after five minutes');
  n++; console.log('ok   directory cache: at most five minutes, even if configured longer');
})();

await (async () => {
  let t = 1_000_000;
  let fail = false;
  let loads = 0;
  const dir = createEmployeeDirectory({
    loadRecords: async () => { loads++; if (fail) throw Object.assign(new Error('boom'), { status: 503 }); return directoryRows(); },
    now: () => t,
  });
  assert.equal((await dir.resolveZuid(ZU(1))).ok, true);
  fail = true;
  t += DIRECTORY_MAX_TTL_MS + 1;
  // Expired + refresh fails: the old snapshot (which said "Ada is active") must NOT be used.
  const r = await dir.resolveZuid(ZU(1));
  assert.deepEqual(r, { ok: false, reason: LOOKUP.UNAVAILABLE });
  assert.equal(dir.status().loaded, false, 'the expired snapshot was discarded, not kept as a fallback');
  // Cool-down: refused without hammering Zoho.
  t += 1000;
  assert.equal((await dir.resolveZuid(ZU(1))).reason, LOOKUP.UNAVAILABLE);
  assert.equal(loads, 2, 'no request during the cool-down');
  assert.equal(dir.status().coolingDown, true);
  // After it, a recovered Zoho is used again.
  fail = false;
  t += DIRECTORY_FAILURE_COOLDOWN_MS;
  assert.equal((await dir.resolveZuid(ZU(1))).ok, true);
  assert.equal(loads, 3);
  n++; console.log('ok   directory failure: a failed refresh is UNAVAILABLE — never the stale snapshot — with a cool-down before retrying');
})();

await (async () => {
  let loads = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const dir = createEmployeeDirectory({ loadRecords: async () => { loads++; await gate; return directoryRows(); } });
  const pending = Promise.all([ZU(1), ZU(2), ZU(3), '799999999', ZU(1)].map((z) => dir.resolveZuid(z)));
  release();
  const results = await pending;
  assert.equal(loads, 1, 'five simultaneous lookups share one refresh');
  assert.deepEqual(results.map((r) => r.ok || r.reason), [true, true, LOOKUP.INACTIVE, LOOKUP.NOT_LINKED, true]);
  n++; console.log('ok   directory concurrency: simultaneous lookups share a single refresh');
})();

await (async () => {
  let loads = 0;
  let release;
  const dir = createEmployeeDirectory({ loadRecords: async () => { loads++; if (loads === 1) await new Promise((r) => { release = r; }); return directoryRows(); } });
  const first = dir.resolveZuid(ZU(1));
  await new Promise((r) => setImmediate(r));
  dir.invalidate();                                      // an org change is known mid-refresh
  release();
  await first;
  assert.equal(dir.status().loaded, false, 'a refresh begun before invalidate() is not kept');
  await dir.resolveZuid(ZU(1));
  assert.equal(loads, 2);
  n++; console.log('ok   directory invalidate: drops the snapshot, and a refresh already in flight is not kept');
})();

await (async () => {
  for (const [rows, label] of [[{ not: 'an array' }, 'malformed'], [Array(MAX_DIRECTORY_RECORDS + 1).fill({}), 'too large']]) {
    const dir = createEmployeeDirectory({ loadRecords: async () => rows });
    assert.equal((await dir.resolveZuid(ZU(1))).reason, LOOKUP.UNAVAILABLE, label);
  }
  n++; console.log('ok   directory input: a malformed or oversized response is unavailable, not a partial directory');
})();

await (async () => {
  const lines = [];
  const logger = { info: (o) => lines.push(JSON.stringify(o)), warn: (o) => lines.push(JSON.stringify(o)) };
  let fail = false;
  let t = 0;
  const dir = createEmployeeDirectory({
    loadRecords: async () => {
      if (fail) throw new Error(`Zoho said: ${R(1)} ${ZU(1)} Ada One x@example.test`);
      return directoryRows();
    },
    now: () => t, logger,
  });
  await dir.resolveZuid(ZU(1));
  fail = true; t += DIRECTORY_MAX_TTL_MS + 1;
  await dir.resolveZuid(ZU(1));
  const logged = lines.join('\n') + JSON.stringify(dir.status());
  for (const leak of [R(1), R(2), ZU(1), ZU(2), 'Ada', 'Bea', 'example.test', 'Zoho said']) assert.equal(logged.includes(leak), false, leak);
  assert.ok(lines.some((l) => l.includes('directory.refreshed') && l.includes('"indexed":11')), 'aggregate counts are logged');
  assert.ok(lines.some((l) => l.includes('directory.refresh_failed') && l.includes('LOAD_FAILED')), 'failures log a code');
  n++; console.log('ok   directory privacy: logs and status() carry counts and codes only — no id, ZUID, name, email or error text');
})();

ok(() => {
  const live = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_DC: 'com', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  const seedFns = Object.values(seedDirectory).filter((v) => typeof v === 'function');
  for (const [k, v] of Object.entries(live.directory)) {
    if (typeof v === 'function') assert.equal(seedFns.includes(v), false, `live directory.${k} is a seed function`);
  }
  // Even a genuinely valid demo token payload resolves to nobody against the live directory.
  assert.equal(live.directory.resolve({ employeeId: 'E1004' }), null);
  assert.equal(live.directory.byUsername('meera'), null);
  assert.deepEqual(live.directory.demoAccounts(), []);
  assert.equal(live.directory.count(), null);
  assert.equal(live.directory.hierarchyAvailable, false, 'team scope stays off until E3');
  assert.equal(typeof live.employeeDirectory.resolveZuid, 'function');
  assert.equal(live.employeeDirectory.status().loaded, false, 'built, not loaded — no request at boot');
}, 'live manifest: no seed identity function survives in live mode; the employee directory is built but not loaded or wired');

ok(() => {
  const seed = buildPeopleManifest({});
  assert.equal(seed.directory, seedDirectory, 'seed mode keeps the seed directory');
  assert.equal(seed.employeeDirectory, undefined, 'and has no live employee directory');
  assert.equal(seed.directory.resolve({ employeeId: 'E1004' }).username, 'meera');
}, 'seed mode: employee identity behaviour is unchanged');

// ---------------------------------------------------------------- employee pagination (E2.1)
// getRecords paging: sIndex 1-based, limit 200. The end-of-list body is the one recorded live on
// 2026-10-14 (.com test organisation): HTTP 200, status 1, errors.code 7024, no result. Everything
// below is synthetic — no organisation larger than two employees has been observed.

/** 18-digit record ids beyond 2^53 and 9-digit ZUIDs, all synthetic. */
const PG_ID = (i) => `5550000002${String(i).padStart(8, '0')}`;
const PG_ZUID = (i) => `7${String(i).padStart(8, '0')}`;
/** One page body as RAW TEXT: ids unquoted where Zoho sends numbers, so precision is really tested. */
const pgPageText = (ids) => `{"response":{"result":[${ids.map((id, i) => `{"${id}":[{"Zoho_ID":${id},"ZUID":"${PG_ZUID(Number(id.slice(-8)))}","Employeestatus":"Active","Reporting_To.ID":"","FirstName":"Test","LastName":"Person${i}","EmailID":"e${id.slice(-8)}@example.test","Department":"Engineering"}]}`).join(',')}],"message":"Data fetched successfully","uri":"/api/forms/employee/getRecords","status":0}}`;
const PG_NO_RECORDS_TEXT = '{"response":{"message":"Error occurred","uri":"/api/forms/employee/getRecords","errors":{"code":7024,"message":"No records found"},"status":1}}';

/**
 * A people client over a synthetic organisation of `total` employees.
 * `override(sIndex, call)` may return [status, text], a Response, or 'hang' to take over a request.
 */
function pagingRig({ total = 0, ids = null, override = null, limits = {}, now, limiter } = {}) {
  const org = ids ?? Array.from({ length: total }, (_, i) => PG_ID(i + 1));
  const calls = [];
  const lines = [];
  const client = createPeopleClient({
    dc: 'com', tokenProvider: stubProvider(),
    logger: { log: (l) => lines.push(String(l)), warn: (l) => lines.push(String(l)) },
    directoryLimiter: limiter ?? createRateLimiter({ name: 'test pages', ...DIRECTORY_PAGE_RATE_LIMIT }),
    directoryLimits: limits,
    ...(now ? { now } : {}),
    fetchImpl: async (url, init) => {
      const u = new URL(url);
      const sIndex = Number(u.searchParams.get('sIndex'));
      const limit = Number(u.searchParams.get('limit'));
      calls.push({ sIndex, limit, keys: [...u.searchParams.keys()].sort() });
      const o = override?.(sIndex, calls.length);
      if (o === 'hang') {
        return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
      }
      if (o instanceof Response) return o;
      const [status, text] = o ?? (() => {
        const slice = org.slice(sIndex - 1, sIndex - 1 + limit);
        return [200, slice.length ? pgPageText(slice) : PG_NO_RECORDS_TEXT];
      })();
      return new Response(text, { status, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, calls, lines, org };
}
const pgStarts = (rig) => rig.calls.map((c) => c.sIndex);

// -- the recorded contract --
ok(() => {
  assert.deepEqual(classifyFormsPage(parseZohoJson(PG_NO_RECORDS_TEXT)), { kind: 'noRecords' });
  assert.equal(FORMS_NO_RECORDS_CODE, 7024);
  const page = classifyFormsPage(parseZohoJson(pgPageText([PG_ID(1), PG_ID(2)])));
  assert.equal(page.kind, 'rows');
  assert.deepEqual(page.rows.map((r) => r.__recordId), [PG_ID(1), PG_ID(2)]);
  assert.deepEqual(CONFIRMED_ENDPOINTS['people.employee.records'].confirmedParams, ['sIndex', 'limit']);
}, 'pagination contract: the recorded end-of-list body is "noRecords"; a status-0 page is rows; sIndex/limit recorded as confirmed');

ok(() => {
  // Anything that is not EXACTLY the recorded shape is refused, never read as "no more records".
  const variants = {
    resultAlsoPresent: '{"response":{"result":[],"errors":{"code":7024,"message":"No records found"},"status":1}}',
    statusZero: '{"response":{"errors":{"code":7024,"message":"No records found"},"status":0}}',
    errorsArray: '{"response":{"errors":[{"code":7024,"message":"No records found"}],"status":1}}',
    codeAsString: '{"response":{"errors":{"code":"7024","message":"No records found"},"status":1}}',
    otherCode: '{"response":{"errors":{"code":7040,"message":"Permission denied to view records"},"status":1}}',
    noErrors: '{"response":{"message":"Error occurred","status":1}}',
    unknownStatus: '{"response":{"result":[],"status":2}}',
    statusMissing: '{"response":{"result":[]}}',
    statusZeroNoResult: '{"response":{"message":"Data fetched successfully","status":0}}',
    statusZeroWithErrors: '{"response":{"result":[],"errors":{"code":7024},"status":0}}',
    noResponse: '{"result":[]}',
    notAnObject: '[]',
  };
  for (const [name, text] of Object.entries(variants)) {
    assert.throws(() => classifyFormsPage(parseZohoJson(text)), EnvelopeError, name);
  }
  assert.throws(() => classifyFormsPage(null), EnvelopeError);
}, 'pagination contract: every 7024 look-alike and every other error shape is refused, not treated as the end');

// -- 1. empty directory --
// CHANGED (E2.1 corrections): a 7024 on the FIRST page used to load as an empty directory. No empty
// organisation has been observed, and "No records found" before any page could equally be a scope
// or form problem — so it is now refused, and the directory is UNAVAILABLE rather than empty.
await (async () => {
  const rig = pagingRig({ total: 0 });
  const err = await rig.client.employees().then(() => null, (e) => e);
  assert.equal(err?.code, PAGINATION.NO_RECORDS_ON_FIRST_PAGE);
  assert.equal(err?.status, 502);
  assert.deepEqual(pgStarts(rig), [1], 'refused without retrying or reading further');
  const dir = createEmployeeDirectory({ loadRecords: () => rig.client.employees() });
  assert.deepEqual(await dir.resolveZuid(PG_ZUID(1)), { ok: false, reason: LOOKUP.UNAVAILABLE });
  n++; console.log('ok   pagination: 7024 on the FIRST page is refused (unverified as empty) — the directory is UNAVAILABLE, not empty');
})();

// -- 2. one page --
await (async () => {
  const rig = pagingRig({ total: 37 });
  const rows = await rig.client.employees();
  assert.equal(rows.length, 37);
  assert.deepEqual(pgStarts(rig), [1], 'a short first page ends the walk: no further request');
  assert.deepEqual(rig.calls[0], { sIndex: 1, limit: EMPLOYEE_PAGE_SIZE, keys: ['limit', 'sIndex'] });
  n++; console.log('ok   pagination: one short page — one request, sIndex=1&limit=200 and nothing else sent');
})();

// -- 3–6. multiple pages, exact multiples, and larger --
await (async () => {
  for (const [total, starts] of [
    [200, [1, 201]],                   // exactly 200: the second request reads the end
    [400, [1, 201, 401]],              // exactly 400
    [450, [1, 201, 401]],              // multiple pages, short last page
    [650, [1, 201, 401, 601]],         // larger than 400
  ]) {
    const rig = pagingRig({ total });
    const rows = await rig.client.employees();
    assert.equal(rows.length, total, `${total}: every employee`);
    assert.deepEqual(rows.map((r) => r.__recordId), rig.org, `${total}: in order, none missing, none repeated`);
    assert.deepEqual(pgStarts(rig), starts, `${total}: requests`);
    assert.ok(rig.calls.every((c) => c.limit === EMPLOYEE_PAGE_SIZE));
  }
  n++; console.log('ok   pagination: 200, 400, 450 and 650 employees load completely, in order, with the minimum requests');
})();

// -- 7. duplicates --
await (async () => {
  const across = pagingRig({ total: 300, override: (s) => (s === 201 ? [200, pgPageText([PG_ID(201), PG_ID(5), PG_ID(202)])] : null) });
  assert.equal(await reason(across.client.employees()), PAGINATION.DUPLICATE_RECORD);
  const within = pagingRig({ ids: [PG_ID(1), PG_ID(2), PG_ID(1)] });
  assert.equal(await reason(within.client.employees()), PAGINATION.DUPLICATE_RECORD);
  n++; console.log('ok   pagination: a __recordId seen twice — across pages or within one — rejects the whole directory');
})();

// -- 8. malformed and unexpected responses --
await (async () => {
  const bad = {
    'non-JSON body': [200, '<html>maintenance</html>'],
    'status 0 without a result': [200, '{"response":{"message":"Data fetched successfully","status":0}}'],
    'another Zoho error': [200, '{"response":{"errors":{"code":7040,"message":"Permission denied to view records"},"status":1}}'],
    'unknown status': [200, '{"response":{"result":[],"status":2}}'],
  };
  for (const [name, reply] of Object.entries(bad)) {
    const rig = pagingRig({ total: 450, override: (s) => (s === 201 ? reply : null) });
    assert.equal(await reason(rig.client.employees()), PAGINATION.UNEXPECTED_RESPONSE, name);
  }
  const empty = pagingRig({ total: 450, override: (s) => (s === 201 ? [200, '{"response":{"result":[],"message":"Data fetched successfully","status":0}}'] : null) });
  assert.equal(await reason(empty.client.employees()), PAGINATION.EMPTY_PAGE);
  const oversized = Array.from({ length: EMPLOYEE_PAGE_SIZE + 1 }, (_, i) => PG_ID(i + 1));
  const big = pagingRig({ total: 0, override: () => [200, pgPageText(oversized)] });
  assert.equal(await reason(big.client.employees()), PAGINATION.OVERSIZED_PAGE);
  n++; console.log('ok   pagination: malformed bodies, other errors, empty status-0 pages and oversized pages all reject the directory');
})();

// -- 9. a failed intermediate page --
await (async () => {
  const server = pagingRig({ total: 650, override: (s) => (s === 401 ? [500, '{"message":"internal"}'] : null) });
  const err = await server.client.employees().then(() => null, (e) => e);
  assert.equal(err?.name, 'ZohoUpstreamError', 'the failure surfaces, not a shorter list');
  assert.equal(err?.status, 503, 'a Zoho 5xx is a 503 to our callers, as everywhere else');
  assert.deepEqual(pgStarts(server), [1, 201, 401], 'not retried, and nothing after the failed page');

  let lockedFor = null;
  const limiter = { acquire() {}, lockout: (s) => { lockedFor = s; } };
  const limited = pagingRig({ total: 450, limiter, override: (s) => (s === 201 ? new Response('{}', { status: 429, headers: { 'retry-after': '90' } }) : null) });
  const limitedErr = await limited.client.employees().then(() => null, (e) => e);
  assert.equal(limitedErr?.name, 'ZohoRateLimitError');
  assert.equal(limitedErr?.status, 429);
  assert.equal(lockedFor, 90, 'a Zoho 429 locks the local limiter for its Retry-After');
  assert.deepEqual(pgStarts(limited), [1, 201], 'and is not retried');
  n++; console.log('ok   pagination: a failed middle page (5xx, 429) rejects the whole walk — no retry, no partial result, 429 locks out');
})();

// -- 10. timeout --
await (async () => {
  const hung = pagingRig({ total: 450, limits: { deadlineMs: 40 }, override: (s) => (s === 201 ? 'hang' : null) });
  assert.equal(await reason(hung.client.employees()), PAGINATION.TIMEOUT);
  let t = 0;
  const slow = pagingRig({ total: 450, limits: { deadlineMs: 1000 }, now: () => t, override: () => { t += 600; return null; } });
  assert.equal(await reason(slow.client.employees()), PAGINATION.TIMEOUT);
  assert.deepEqual(pgStarts(slow), [1, 201], 'the deadline stops the walk before the next request');
  n++; console.log('ok   pagination: a hung page and a walk past its overall deadline both reject the directory');
})();

// -- 11. repeated pages --
await (async () => {
  const first = Array.from({ length: EMPLOYEE_PAGE_SIZE }, (_, i) => PG_ID(i + 1));
  const stuck = pagingRig({ total: 0, override: () => [200, pgPageText(first)] });
  assert.equal(await reason(stuck.client.employees()), PAGINATION.REPEATED_PAGE);
  assert.deepEqual(pgStarts(stuck), [1, 201], 'caught on the second request, not after looping');
  n++; console.log('ok   pagination: a server that ignores sIndex (the same page again) is caught as a loop');
})();

// -- 12. safety limits --
await (async () => {
  assert.equal(DIRECTORY_MAX_RECORDS, MAX_DIRECTORY_RECORDS, 'client and directory agree on the record ceiling');
  assert.equal(DIRECTORY_MAX_PAGES * EMPLOYEE_PAGE_SIZE, DIRECTORY_MAX_RECORDS);
  assert.ok(DIRECTORY_PAGE_RATE_LIMIT.limit >= DIRECTORY_MAX_PAGES + 1, 'the limiter admits one full walk');

  const exact = pagingRig({ total: 400, limits: { maxPages: 2 } });
  assert.equal((await exact.client.employees()).length, 400, 'exactly maxPages full pages: the end read is still allowed');
  const over = pagingRig({ total: 401, limits: { maxPages: 2 } });
  assert.equal(await reason(over.client.employees()), PAGINATION.PAGE_LIMIT);
  assert.deepEqual(pgStarts(over), [1, 201, 401]);
  const records = pagingRig({ total: 450, limits: { maxRecords: 300 } });
  assert.equal(await reason(records.client.employees()), PAGINATION.RECORD_LIMIT);

  // Limits can be lowered, never raised: 1e9 pages is clamped to the 50-page ceiling.
  const clamped = pagingRig({ total: DIRECTORY_MAX_RECORDS + 1, limits: { maxPages: 1e9, maxRecords: 1e9 } });
  assert.equal(await reason(clamped.client.employees()), PAGINATION.PAGE_LIMIT);
  assert.equal(clamped.calls.length, DIRECTORY_MAX_PAGES + 1);
  n++; console.log('ok   pagination: page and record ceilings reject an oversized organisation; limits can be lowered, never raised');
})();

// -- 13. precision --
await (async () => {
  const rig = pagingRig({ total: 250 });
  const rows = await rig.client.employees();
  for (const [i, r] of rows.entries()) {
    assert.equal(typeof r.__recordId, 'string');
    assert.equal(r.__recordId, rig.org[i]);
    assert.equal(r.Zoho_ID, rig.org[i], 'the unquoted 18-digit Zoho_ID arrives as the exact string');
  }
  assert.ok(Number(PG_ID(1)) > Number.MAX_SAFE_INTEGER, 'the fixture ids really are past 2^53');
  const index = buildEmployeeIndex(rows);
  assert.equal(index.counts.indexed, 250);
  assert.equal(index.issues.record_id_mismatch, 0);
  n++; console.log('ok   pagination: 18-digit ids survive every page exactly, and the identity index accepts them all');
})();

// -- 14. a failed refresh after a successful one --
await (async () => {
  let t = 0;
  let failNext = false;
  const rig = pagingRig({ total: 450, override: (s) => (failNext && s === 201 ? [503, '{}'] : null) });
  const lines = [];
  const dir = createEmployeeDirectory({
    loadRecords: () => rig.client.employees(), now: () => t,
    logger: { info: (o) => lines.push(JSON.stringify(o)), warn: (o) => lines.push(JSON.stringify(o)) },
  });
  assert.equal((await dir.resolveZuid(PG_ZUID(300))).ok, true, 'an employee from page 2 resolves');
  failNext = true;
  t += DIRECTORY_MAX_TTL_MS;
  assert.deepEqual(await dir.resolveZuid(PG_ZUID(1)), { ok: false, reason: LOOKUP.UNAVAILABLE }, 'page 1 loaded again, page 2 failed: no partial, no stale');
  assert.deepEqual(await dir.resolveZuid(PG_ZUID(300)), { ok: false, reason: LOOKUP.UNAVAILABLE });
  assert.equal(dir.status().loaded, false);
  assert.ok(lines.some((l) => l.includes('directory.refresh_failed')));
  n++; console.log('ok   pagination: a failed refresh after a good one is UNAVAILABLE — neither the old snapshot nor the pages that did load');
})();

// -- 15. a 7024 only ends the walk where the recorded one did --
await (async () => {
  // Directly after a SHORT page the walk never asks again, so no 7024 can be read there.
  const short = pagingRig({ total: 150, override: (s) => (s > 1 ? [200, PG_NO_RECORDS_TEXT] : null) });
  assert.equal((await short.client.employees()).length, 150);
  assert.deepEqual(pgStarts(short), [1]);
  // A 7024 carried by an HTTP error is an error.
  for (const status of [400, 404, 500]) {
    const rig = pagingRig({ total: 450, override: (s) => (s === 201 ? [status, PG_NO_RECORDS_TEXT] : null) });
    assert.notEqual(await reason(rig.client.employees()), 'resolved', `HTTP ${status}`);
  }
  // A 7024 look-alike mid-walk is UNEXPECTED, not the end.
  const lookAlike = pagingRig({ total: 450, override: (s) => (s === 201 ? [200, '{"response":{"result":[],"errors":{"code":7024,"message":"No records found"},"status":1}}'] : null) });
  assert.equal(await reason(lookAlike.client.employees()), PAGINATION.UNEXPECTED_RESPONSE);
  // The documented residual risk, pinned so it cannot change silently: the EXACT 7024 directly
  // after a full page is read as the end, even if more employees exist. Zoho gives nothing to
  // tell the two apart.
  const truncated = pagingRig({ total: 450, override: (s) => (s === 201 ? [200, PG_NO_RECORDS_TEXT] : null) });
  assert.equal((await truncated.client.employees()).length, 200);
  n++; console.log('ok   pagination: 7024 is accepted only in the recorded position and shape; HTTP-error and look-alike 7024s reject the directory');
})();

// -- logs --
await (async () => {
  const rig = pagingRig({ total: 450 });
  await rig.client.employees();
  const failed = pagingRig({ total: 450, override: (s) => (s === 201 ? [200, pgPageText([PG_ID(1)])] : null) });
  await failed.client.employees().catch(() => {});
  const all = [...rig.lines, ...failed.lines].join('\n');
  for (const id of rig.org.slice(0, 450)) assert.equal(all.includes(id), false);
  assert.equal(/example\.test|Person\d|7\d{8}/.test(all), false, 'no email, name or ZUID');
  assert.ok(all.includes('"zoho.people.employees.loaded"') && all.includes('"records":450'));
  assert.ok(all.includes(PAGINATION.DUPLICATE_RECORD));
  n++; console.log('ok   pagination: logs carry page and record counts and failure codes only — no id, ZUID, name or email');
})();

// ---------------------------------------------------------------- employees() consumers (E2.1)
// Every caller of the paged employees(): the live `employees` query source, live headcount, live
// employeeLookup, and the E2 directory (tests 1 and 14 above). Each must see the WHOLE directory
// or an error — never a partial list, never a substitute, never wider reach.
const failPage2 = (rigOpts = {}) => {
  let failing = true;
  const rig = pagingRig({ total: 450, ...rigOpts, override: (s) => (failing && s === 201 ? [503, '{"message":"unavailable"}'] : null) });
  return { ...rig, heal: () => { failing = false; } };
};
const pgNoIdsIn = (text) => !/\d{18}|7\d{8}|example\.test/.test(String(text));

// -- headcount --
await (async () => {
  const good = pagingRig({ total: 450 });
  const d = await buildLiveTools({ client: good.client })['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN);
  assert.equal(d.total, 450, 'counts every page');
  assert.deepEqual(d.groups, [{ name: 'Engineering', value: 450 }]);
  assert.deepEqual(pgStarts(good), [1, 201, 401]);

  const bad = failPage2();
  const err = await buildLiveTools({ client: bad.client })['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN).then(() => null, (e) => e);
  assert.equal(err?.status, 503, 'the failure propagates — no total of 200 from the page that did load');
  assert.ok(pgNoIdsIn(err.message));
  n++; console.log('ok   consumer headcount: counts all 450 across pages; a failed middle page is a 503, never a partial total');
})();

// -- employeeLookup --
await (async () => {
  const good = pagingRig({ total: 450 });
  const d = await buildLiveTools({ client: good.client })['zohoPeople.employeeLookup'].run({ name: 'e00000430' }, ADMIN);
  assert.equal(d.count, 1, 'an employee on page 3 is found');
  assert.equal(d.employees[0].employeeId, PG_ID(430));
  assert.deepEqual(Object.keys(d.employees[0]), PERSON_FIELDS, 'allow-listed fields only');

  const bad = failPage2();
  const err = await buildLiveTools({ client: bad.client })['zohoPeople.employeeLookup'].run({ name: 'e00000001' }, ADMIN).then(() => null, (e) => e);
  assert.equal(err?.status, 503, 'even a match on page 1 is not returned from an incomplete walk');
  assert.ok(pgNoIdsIn(err.message));

  // Reach is decided before any request: in live mode a manager's team is unknown -> 403, zero calls.
  const mgr = pagingRig({ total: 450 });
  await withLiveDirectory(async () => {
    await assert.rejects(() => buildLiveTools({ client: mgr.client })['zohoPeople.employeeLookup'].run({ name: 'e' }, MANAGER_LIVE), (e) => e.status === 403);
  });
  assert.equal(mgr.calls.length, 0, 'no page is fetched for a caller who may not search');
  n++; console.log('ok   consumer employeeLookup: finds a page-3 employee; a failed walk is a 503; a manager is refused before any page');
})();

// -- the live `employees` query source --
await (async () => {
  const rig = failPage2();
  // CHANGED in E2.2: the source reads the shared employee snapshot, which adds a 30 s cool-down
  // after a failed load (no request storm). This used to retry at once; now the retry is refused
  // WITHOUT a request until the cool-down ends — then it walks again.
  let t = 1_000_000;
  const employeeSnapshot = createEmployeeSnapshot({ loadRecords: () => rig.client.employees(), namespace: TEST_NS, now: () => t });
  registerSources({ __pgEmployees: buildLiveSources({ client: rig.client, employeeSnapshot }).employees });
  const admin = { employeeId: 'E9101', role: 'hr_admin' };
  const spec = { source: '__pgEmployees', metric: 'count' };

  await assert.rejects(() => runQueryAsync(spec, admin), (e) => e.status === 503);
  rig.heal();
  const after = rig.calls.length;
  await assert.rejects(() => runQueryAsync(spec, admin), (e) => e.status === 503 && e.code === 'DIRECTORY_COOLDOWN');
  assert.equal(rig.calls.length, after, 'during the cool-down: refused without a request');
  t += SNAPSHOT_FAILURE_COOLDOWN_MS;
  assert.equal((await runQueryAsync(spec, admin)).data[0].value, 450, 'the failure was not cached: after the cool-down it walks again');
  assert.equal(rig.calls.length, after + 3);
  await runQueryAsync(spec, admin);
  await runQueryAsync(spec, { employeeId: 'E9102', role: 'hr_admin' });
  assert.equal(rig.calls.length, after + 3, 'a complete directory IS shared for its TTL: no second walk, for any admin');

  const before = rig.calls.length;
  await assert.rejects(() => runQueryAsync(spec, { employeeId: 'E1002', role: 'employee' }), (e) => e.status === 403);
  assert.equal(rig.calls.length, before, 'a non-admin is refused before any page is fetched');
  n++; console.log('ok   consumer employees source: failures are not cached (and cool down), complete loads are shared, non-admins are refused before fetching');
})();

// -- all consumers share one page budget --
await (async () => {
  // CHANGED in E2.2: headcount and employeeLookup now share ONE snapshot, so the second tool no
  // longer walks at all (this asserted that its walk ran out of budget). The limiter is still the
  // backstop when a walk IS needed — forced here by invalidating the snapshot.
  const limiter = createRateLimiter({ name: 'test shared pages', limit: 5, windowMs: 60_000, lockoutMs: 120_000 });
  const rig = pagingRig({ total: 450, limiter });
  const employeeSnapshot = createEmployeeSnapshot({ loadRecords: () => rig.client.employees(), namespace: TEST_NS });
  const tools = buildLiveTools({ client: rig.client, employeeSnapshot });
  assert.equal((await tools['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN)).total, 450);   // 3 pages
  assert.equal((await tools['zohoPeople.employeeLookup'].run({ name: 'e00000001' }, ADMIN)).count, 1);
  assert.equal(rig.calls.length, 3, 'the second tool reads the shared snapshot — no second walk');
  employeeSnapshot.invalidate();
  const err = await tools['zohoPeople.employeeLookup'].run({ name: 'e00000001' }, ADMIN).then(() => null, (e) => e);
  assert.equal(err?.code, 'LOCAL_RATE_LIMIT', 'a forced re-walk runs out of budget and fails closed');
  assert.equal(err?.status, 429);
  assert.equal(rig.calls.length, 5, 'and the refused page never reached the network');
  n++; console.log('ok   consumers: one shared snapshot (no second walk); a forced re-walk still draws on the shared limiter and fails closed');
})();


// ================================================================ E2.2 — environment security, isolation, shared snapshot

// ---------------------------------------------------------------- OAuth api_domain (Part 2)
ok(() => {
  for (const [code, dc] of Object.entries(DATA_CENTRES)) {
    assert.match(expectedApiDomain(code), /^https:\/\/www\.zohoapis\.[a-z.]+$/, code);
    assert.equal(dc.apiDomainStatus === 'confirmed', code === 'com', `${code}: only .com was observed`);
  }
  assert.equal(expectedApiDomain('com'), 'https://www.zohoapis.com');
  assert.throws(() => expectedApiDomain(), /no data centre given/);
}, 'Part 2: every DC has one allow-listed token api_domain; only .com (observed) is marked confirmed');

await (async () => {
  const domainRes = (apiDomain) => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ access_token: 'TOKEN_SENTINEL_VALUE', expires_in: 3600, ...(apiDomain === undefined ? {} : { api_domain: apiDomain }) }) });
  for (const [apiDomain, code] of [
    ['https://www.zohoapis.com', 'API_DOMAIN_MISMATCH'],   // a .com token offered to an `in` config
    ['https://www.zohoapis.eu', 'API_DOMAIN_MISMATCH'],
    ['https://evil.example.test', 'API_DOMAIN_MISMATCH'],
    ['https://www.zohoapis.in.evil.test', 'API_DOMAIN_MISMATCH'],
    ['', 'API_DOMAIN_MISSING'],
    [undefined, 'API_DOMAIN_MISSING'],
  ]) {
    let calls = 0;
    const lines = [];
    const p = createTokenProvider({
      config: CONFIG,
      fetchImpl: async () => { calls++; return domainRes(apiDomain); },
      logger: { info: (o) => lines.push(JSON.stringify(o)) },
    });
    const err = await p.getAccessToken().then(() => null, (e) => e);
    assert.equal(err?.code, code, String(apiDomain));
    assert.equal(err?.status, 503);
    assert.equal(p.hasCachedToken(), false, 'a refused token is never cached');
    await p.getAccessToken().catch(() => {});
    assert.equal(calls, 2, 'and the next call asks again rather than reusing it');
    const surface = `${err.message}\n${lines.join('\n')}`;
    assert.equal(surface.includes('TOKEN_SENTINEL_VALUE'), false, 'the token never reaches a message or a log');
    if (apiDomain) assert.equal(surface.includes(apiDomain), false, 'the untrusted domain is not echoed');
  }
  // The matching domain is accepted.
  const good = createTokenProvider({ config: { ...CONFIG, dc: 'com' }, fetchImpl: async () => domainRes('https://www.zohoapis.com') });
  assert.equal(await good.getAccessToken(), 'TOKEN_SENTINEL_VALUE');
  n++; console.log('ok   Part 2: a token for another DC, an unknown domain or no domain is refused (503), never cached, never logged');
})();

// ---------------------------------------------------------------- namespaced cache keys (Part 5)
ok(() => {
  assert.throws(() => scopedCacheKey('', 'E1', 'leave'), /deployment namespace/);
  assert.throws(() => scopedCacheKey(undefined, 'E1', 'leave'), /deployment namespace/);
  assert.throws(() => scopedCacheKey('test/zoho-com/a', '', 'leave'), /must include the caller/);
  const t = scopedCacheKey('test/zoho-com/acme-test', 'E1', 'leave', '2026-01');
  const p = scopedCacheKey('prod/zoho-com/acme-prod', 'E1', 'leave', '2026-01');
  assert.notEqual(t, p, 'the same caller and question in two deployments are two entries');
  assert.notEqual(scopedCacheKey('test/zoho-com/a', 'E1', 'leave'), scopedCacheKey('test/zoho-com/a', 'E2', 'leave'));
}, 'Part 5: every live cache key carries the deployment namespace and the caller — neither may be missing');

await (async () => {
  let reads = 0;
  const client = { leaves: async () => { reads++; return []; }, employees: async () => [] };
  const sources = buildLiveSources({ client });
  for (const user of [undefined, {}, { role: 'hr_admin' }, { employeeId: '' }]) {
    await assert.rejects(() => sources.leave.fetchRows({ user }), (e) => e.status === 401);
    await assert.rejects(() => sources.employees.fetchRows({ user }), (e) => e.status === 401);
  }
  assert.equal(reads, 0, 'refused before any request');
  n++; console.log("ok   Part 5: no 'anonymous' shared cache key — a live read with no caller id is a 401 before any request");
})();

// ---------------------------------------------------------------- the shared snapshot service (Part 4)
const snapRows = (count) => Array.from({ length: count }, (_, i) => ({ __recordId: PG_ID(i + 1), ZUID: PG_ZUID(i + 1), Employeestatus: 'Active' }));

await (async () => {
  let loads = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const s = createEmployeeSnapshot({ loadRecords: async () => { loads++; await gate; return snapRows(5); }, namespace: TEST_NS });
  const waiting = Promise.all(Array.from({ length: 50 }, () => s.get()));
  release();
  const all = await waiting;
  assert.equal(loads, 1, '50 simultaneous callers, one load');
  assert.ok(all.every((x) => x === all[0]), 'and every one received the same snapshot object');
  assert.equal(all[0].namespace, TEST_NS);
  assert.equal(all[0].size, 5);
  n++; console.log('ok   Part 4 snapshot: single-flight — 50 concurrent callers share one load and one snapshot');
})();

await (async () => {
  let t = 1_000_000;
  let loads = 0;
  const s = createEmployeeSnapshot({ loadRecords: async () => { loads++; return snapRows(3); }, namespace: TEST_NS, now: () => t, ttlMs: 10 * 60 * 1000 });
  assert.equal(s.status().ttlMs, SNAPSHOT_MAX_TTL_MS, 'a longer TTL is clamped to five minutes');
  const a = await s.get();
  t += SNAPSHOT_MAX_TTL_MS - 1;
  assert.equal(await s.get(), a, 'a fresh snapshot is served without a load');
  t += 1;
  const b = await s.get();
  assert.notEqual(b, a);
  assert.equal(loads, 2, 'expired at exactly five minutes');
  s.invalidate();
  assert.equal(s.status().loaded, false);
  await s.get();
  assert.equal(loads, 3, 'invalidate() forces the next read to load');
  n++; console.log('ok   Part 4 snapshot: TTL at most five minutes, served from memory while fresh, reloaded after expiry or invalidate()');
})();

await (async () => {
  let loads = 0;
  let release;
  const s = createEmployeeSnapshot({
    loadRecords: async () => { const mine = ++loads; if (mine === 1) await new Promise((r) => { release = r; }); return snapRows(mine); },
    namespace: TEST_NS,
  });
  const before = s.get();                        // load 1 in flight
  await new Promise((r) => setImmediate(r));
  s.invalidate();                                // e.g. a known organisation change
  const after = s.get();                         // must NOT join the pre-invalidation load
  release();
  const [x, y] = await Promise.all([before, after]);
  assert.equal(loads, 2, 'a caller after invalidate() starts its own load');
  assert.equal(y.size, 2, 'and gets the post-invalidation data');
  assert.equal(x.size, 1, 'the earlier caller still gets the load it was waiting for');
  assert.equal((await s.get()).size, 2, 'the pre-invalidation load was never stored');
  n++; console.log('ok   Part 4 snapshot: invalidate() during a load — later callers never join it, and it is never stored');
})();

await (async () => {
  let t = 1_000_000;
  let mode = 'ok';
  let loads = 0;
  const lines = [];
  const s = createEmployeeSnapshot({
    loadRecords: async () => {
      loads++;
      if (mode === 'zoho403') throw Object.assign(new Error(`Zoho said: ${PG_ID(1)} x@example.test`), { status: 403, code: 'NOT_ALLOWED' });
      if (mode === 'zoho429') throw Object.assign(new Error('rate'), { status: 429, code: 'RATE_LIMITED' });
      if (mode === 'zoho500') throw Object.assign(new Error('Zoho People is unavailable right now.'), { status: 503 });
      if (mode === 'odd') throw new Error(`internal detail ${PG_ZUID(1)}`);
      return snapRows(2);
    },
    namespace: TEST_NS, now: () => t,
    logger: { info: (o) => lines.push(JSON.stringify(o)), warn: (o) => lines.push(JSON.stringify(o)) },
  });
  await s.get();
  for (const [m, status, code] of [['zoho403', 403, 'NOT_ALLOWED'], ['zoho429', 429, 'RATE_LIMITED'], ['zoho500', 503, 'HTTP_503'], ['odd', 503, 'LOAD_FAILED']]) {
    mode = m;
    t += SNAPSHOT_MAX_TTL_MS + SNAPSHOT_FAILURE_COOLDOWN_MS + 1;
    const err = await s.get().then(() => null, (e) => e);
    assert.ok(err instanceof EmployeeSnapshotError, m);
    assert.equal(err.status, status, `${m}: a 403 stays a 403, a 429 stays a 429, anything else is a 503`);
    assert.equal(err.code, code, m);
    assert.equal(s.status().loaded, false, `${m}: the expired snapshot was dropped, not served`);
    for (const leak of [PG_ID(1), PG_ZUID(1), 'example.test', 'Zoho said', 'internal detail']) assert.equal(err.message.includes(leak), false, `${m}: ${leak}`);
  }
  // Cool-down: refused WITHOUT a request; a 403 stays a 403 during it.
  mode = 'zoho403';
  t += SNAPSHOT_FAILURE_COOLDOWN_MS + 1;
  await s.get().catch(() => {});
  const n0 = loads;
  for (let i = 0; i < 25; i++) {
    t += 100;
    const e = await s.get().then(() => null, (x) => x);
    assert.equal(e.status, 403);
  }
  assert.equal(loads, n0, '25 calls during the cool-down: zero requests (no request storm)');
  mode = 'ok';
  t += SNAPSHOT_FAILURE_COOLDOWN_MS;
  assert.equal((await s.get()).size, 2, 'after the cool-down a recovered Zoho is used again');
  const logged = lines.join('\n');
  for (const leak of [PG_ID(1), PG_ZUID(1), 'example.test', 'Zoho said', 'internal detail']) assert.equal(logged.includes(leak), false, leak);
  assert.ok(logged.includes('employee_snapshot.load_failed') && logged.includes('"records":2'));
  n++; console.log('ok   Part 4 snapshot: failures keep only status and code (403/429 preserved), drop the old snapshot, cool down without requests, recover');
})();

await (async () => {
  for (const [rows, code] of [[{ not: 'an array' }, 'MALFORMED'], [null, 'MALFORMED'], [snapRows(11), 'TOO_LARGE']]) {
    const s = createEmployeeSnapshot({ loadRecords: async () => rows, namespace: TEST_NS, maxRecords: 10 });
    const e = await s.get().then(() => null, (x) => x);
    assert.equal(e?.code, code);
    assert.equal(s.status().loaded, false, 'nothing stored');
  }
  const s = createEmployeeSnapshot({ loadRecords: async () => snapRows(3), namespace: TEST_NS });
  const snap = await s.get();
  assert.ok(Object.isFrozen(snap) && Object.isFrozen(snap.rows) && snap.rows.every(Object.isFrozen));
  assert.throws(() => { snap.rows[0].Employeestatus = 'Inactive'; }, TypeError, 'no consumer can mutate the shared rows');
  assert.throws(() => { snap.rows.push({}); }, TypeError);
  assert.equal(snap.rows[0].__recordId, PG_ID(1), 'exact 18-digit id, as a string');
  n++; console.log('ok   Part 4 snapshot: malformed and oversized loads are never stored; a stored snapshot is deeply frozen with exact ids');
})();

await (async () => {
  let ns = TEST_NS;
  let loads = 0;
  const s = createEmployeeSnapshot({ loadRecords: async () => { loads++; return snapRows(2); }, namespace: () => ns });
  const a = await s.get();
  assert.equal(a.namespace, TEST_NS);
  ns = 'prod/zoho-com/acme-prod';
  const b = await s.get();
  assert.equal(loads, 2, 'a snapshot from another namespace is dropped, never served');
  assert.equal(b.namespace, 'prod/zoho-com/acme-prod');
  assert.throws(() => assertSnapshotNamespace(a, 'prod/zoho-com/acme-prod'), (e) => e.code === 'NAMESPACE_MISMATCH');
  assert.equal(assertSnapshotNamespace(b, () => 'prod/zoho-com/acme-prod'), b);
  ns = () => { throw Object.assign(new Error('unbound'), { code: 'DEPLOYMENT_UNBOUND' }); };
  const unbound = createEmployeeSnapshot({ loadRecords: async () => { loads++; return []; }, namespace: () => ns() });
  const before = loads;
  await assert.rejects(() => unbound.get(), (e) => e.code === 'DEPLOYMENT_UNBOUND' && e.status === 503);
  assert.equal(loads, before, 'an unbound deployment never loads');
  assert.throws(() => createEmployeeSnapshot({ loadRecords: async () => [] }), /namespace/);
  assert.throws(() => createEmployeeSnapshot({ loadRecords: async () => [], namespace: '' }), /namespace/);
  n++; console.log('ok   Part 4 snapshot: namespace-bound — another namespace\'s snapshot is never served; no namespace, no snapshot');
})();

// ---------------------------------------------------------------- one snapshot, every consumer (Part 4 integration)
await (async () => {
  const rig = pagingRig({ total: 450 });
  const employeeSnapshot = createEmployeeSnapshot({ loadRecords: () => rig.client.employees(), namespace: TEST_NS });
  const sources = buildLiveSources({ client: rig.client, employeeSnapshot });
  const tools = buildLiveTools({ client: rig.client, employeeSnapshot });
  const directory = createEmployeeDirectory({ snapshot: employeeSnapshot, namespace: TEST_NS });
  registerSources({ __e22Employees: sources.employees });

  const results = await Promise.all([
    directory.resolveZuid(PG_ZUID(300)),
    tools['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN),
    tools['zohoPeople.employeeLookup'].run({ name: 'e00000430' }, ADMIN),
    runQueryAsync({ source: '__e22Employees', metric: 'count' }, ADMIN),
    directory.reportsOf(PG_ID(1)),
  ]);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].total, 450);
  assert.equal(results[2].count, 1);
  assert.equal(results[3].data[0].value, 450);
  assert.equal(employeeSnapshot.status().loads, 1, 'five concurrent consumers, one load');
  assert.deepEqual(pgStarts(rig), [1, 201, 401], 'one walk of three pages — not one per consumer');
  for (let i = 0; i < 20; i++) {
    await directory.resolveZuid(PG_ZUID(i + 1));
    await tools['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN);
    await tools['zohoPeople.employeeLookup'].run({ name: `e000000${String(i + 10).padStart(2, '0')}` }, ADMIN);
  }
  assert.equal(rig.calls.length, 3, '60 more consumer calls while fresh: zero requests');
  n++; console.log('ok   Part 4: the directory, employees source, headcount and lookup share ONE load (3 pages for 450) — cache hits make no request');
})();

await (async () => {
  const rig = pagingRig({ total: 450, override: (s) => (s === 201 ? [503, '{}'] : null) });
  const employeeSnapshot = createEmployeeSnapshot({ loadRecords: () => rig.client.employees(), namespace: TEST_NS });
  const tools = buildLiveTools({ client: rig.client, employeeSnapshot });
  const directory = createEmployeeDirectory({ snapshot: employeeSnapshot, namespace: TEST_NS });
  const [dir, head, look] = await Promise.all([
    directory.resolveZuid(PG_ZUID(1)),
    tools['zohoPeople.headcount'].run({ groupBy: 'department' }, ADMIN).then(() => null, (e) => e),
    tools['zohoPeople.employeeLookup'].run({ name: 'e00000001' }, ADMIN).then(() => null, (e) => e),
  ]);
  assert.deepEqual(dir, { ok: false, reason: LOOKUP.UNAVAILABLE }, 'the directory: unavailable, not page 1');
  assert.equal(head?.status, 503, 'headcount: an error, not a total of 200');
  assert.equal(look?.status, 503, 'lookup: an error, even though the match was on page 1');
  assert.deepEqual(pgStarts(rig), [1, 201], 'one failed walk, shared — not three');
  n++; console.log('ok   Part 4: a failed shared load fails every consumer at once — no partial directory anywhere, one walk');
})();

// ---------------------------------------------------------------- access control with a WARM shared cache (Part 4 / Part 7)
await (async () => {
  const rig = pagingRig({ total: 300 });
  const employeeSnapshot = createEmployeeSnapshot({ loadRecords: () => rig.client.employees(), namespace: TEST_NS });
  const sources = buildLiveSources({ client: rig.client, employeeSnapshot });
  const tools = buildLiveTools({ client: rig.client, employeeSnapshot });
  registerSources({ __e22Warm: sources.employees });
  // An HR admin warms the organisation-wide snapshot.
  assert.equal((await runQueryAsync({ source: '__e22Warm', metric: 'count' }, ADMIN)).data[0].value, 300);
  const warmCalls = rig.calls.length;

  // ...and that grants nobody else anything.
  for (const caller of [EMPLOYEE, MANAGER_LIVE, { employeeId: '555000000200000001', role: 'employee' }]) {
    await assert.rejects(() => runQueryAsync({ source: '__e22Warm', metric: 'count' }, caller), (e) => e.status === 403, caller.role);
  }
  assert.equal(mayCall('zohoPeople.headcount', EMPLOYEE), false, 'headcount stays admin-only');
  assert.equal(mayCall('zohoPeople.headcount', MANAGER_LIVE), false);
  assert.equal(mayCall('zohoPeople.employeeLookup', EMPLOYEE), false, 'lookup stays team-scoped: employees cannot call it');
  await withLiveDirectory(async () => {
    // Live mode: no reporting line is trusted (E3 not built) — a manager is refused, warm cache or not.
    await assert.rejects(() => tools['zohoPeople.employeeLookup'].run({ name: 'e' }, MANAGER_LIVE), (e) => e.status === 403);
  });
  assert.equal(rig.calls.length, warmCalls, 'the refusals made no request either');

  // A guessed record id is no shortcut: the lookup matches on reach first, then on the query.
  const admin = await tools['zohoPeople.employeeLookup'].run({ name: PG_ID(150).slice(-8) }, ADMIN);
  for (const e of admin.employees) assert.deepEqual(Object.keys(e), PERSON_FIELDS, 'allow-listed fields only, never the raw row');
  n++; console.log('ok   Part 4/7: a snapshot warmed by an HR admin grants no employee or manager anything — 403s, no request, allow-listed output');
})();

await (async () => {
  // Per-caller answers are never shared: the balance cache key carries namespace AND caller.
  const keys = new Set();
  const balanceCache = { wrap: async (key, _ttl, loader) => { keys.add(key); return loader(); } };
  const rig = balanceRig();
  const tools = buildLiveTools({ client: rig.client, now: () => OCT13, leaveYearStart: '01-01', balanceCache });
  await withDigitDirectory(async () => {
    await tools['zohoPeople.leaveBalance'].run({}, SELF_U).catch(() => {});
    await tools['zohoPeople.leaveBalance'].run({ employeeId: EMP }, ADMIN_U).catch(() => {});
  });
  const list = [...keys];
  assert.equal(list.length, 2, 'two callers asking about the same employee: two cache entries');
  assert.ok(list.every((k) => k.startsWith(`${TEST_NS}#`)), 'each key starts with the deployment namespace');
  assert.notEqual(list[0], list[1]);
  n++; console.log('ok   Part 7: per-caller results are cached per namespace AND per caller — never returned to another user');
})();

// ---------------------------------------------------------------- 401 during paging (Part 7)
await (async () => {
  let page2 = 0;
  const rig = pagingRig({ total: 450, override: (s) => (s === 201 && page2++ === 0 ? new Response('{"code":"INVALID_TOKEN"}', { status: 401 }) : null) });
  const rows = await rig.client.employees();
  assert.equal(rows.length, 450, 'one 401 buys exactly one token refresh and one retry of that page');
  assert.deepEqual(pgStarts(rig), [1, 201, 201, 401]);

  const always = pagingRig({ total: 450, override: (s) => (s === 201 ? new Response('{}', { status: 401 }) : null) });
  const err = await always.client.employees().then(() => null, (e) => e);
  assert.equal(err?.status, 401, 'a second 401 is surfaced, not retried forever');
  assert.deepEqual(pgStarts(always), [1, 201, 201]);
  const snap = createEmployeeSnapshot({ loadRecords: () => always.client.employees(), namespace: TEST_NS });
  const e2 = await snap.get().then(() => null, (e) => e);
  assert.equal(e2.status, 503, 'to a consumer, a credential failure is "unavailable" — never a partial directory');
  n++; console.log('ok   Part 7: a 401 mid-walk refreshes the token once and retries that page once; a persistent 401 fails the whole load');
})();

console.log(`\nall ${n} zoho integration checks pass`);
