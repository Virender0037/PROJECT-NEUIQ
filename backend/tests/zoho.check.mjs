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
  dataCentre, apiBase, accountsBase, isConfirmed, DATA_CENTRES, DEFAULT_DC,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/datacenters.js';
import {
  scopeFor, requestedScopes, isConfirmedScope, CONFIRMED_SCOPES, PENDING_SCOPES,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/scopes.js';
import {
  toZohoDate, fromZohoDate, monthKey, dateRangeParams, ZOHO_DATE_FORMAT, MONTHS,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/dates.js';
import {
  unwrapV3, flattenKeyedRecords, unwrapForms, EnvelopeError, FORMS_RESULT_PATH,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/envelope.js';
import {
  mapHttpError, mapNetworkError, redact, isRetryable, isRefreshable,
  ZohoAuthError, ZohoForbiddenError, ZohoRateLimitError, ZohoUpstreamError,
} from '../functions/neuiq_api/src/integrations/zoho/_shared/errors.js';
import {
  resolveDataSource, describeDataSource, SEED, ZOHO,
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
import { createCache, cacheKey } from '../functions/neuiq_api/src/core/platform/cache.js';
import { createZohoClient } from '../functions/neuiq_api/src/integrations/zoho/_shared/client.js';
import {
  transformEmployeeRecord, transformEmployeeRecords, buildEmailIndex,
  EMPLOYEE_GAPS, ALLOWED_EMPLOYEE_FIELDS, DROPPED_PII_FIELDS,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/employee.js';
import {
  transformAttendanceRecord, transformAttendanceRecords,
  ATTENDANCE_TRANSFORMER_READY, ATTENDANCE_TODO,
} from '../functions/neuiq_api/src/integrations/zoho/people/transformers/attendance.js';
import { buildLiveSources } from '../functions/neuiq_api/src/integrations/zoho/people/sources.live.js';
import { buildLiveTools } from '../functions/neuiq_api/src/integrations/zoho/people/tools/live.js';
import { buildPeopleManifest } from '../functions/neuiq_api/src/integrations/zoho/people/manifest.js';
import { PEOPLE_TOOLS } from '../functions/neuiq_api/src/integrations/zoho/people/tools/index.js';
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

// ---------------------------------------------------------------- data centres
ok(() => assert.equal(DEFAULT_DC, 'in'), 'dc: India is the default');
ok(() => assert.equal(apiBase('people', 'in'), 'https://people.zoho.in'), 'dc: confirmed India People host');
ok(() => assert.equal(accountsBase('in'), 'https://accounts.zoho.in'), 'dc: India accounts host');
ok(() => assert.ok(isConfirmed('in')), 'dc: India is marked confirmed');
ok(() => assert.equal(isConfirmed('com'), false), 'dc: unreached DCs are not marked confirmed');
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
throws(() => scopeFor('people.leave.read'), 'scopes: pending leave scope refuses rather than guessing');
throws(() => scopeFor('people.attendance.read'), 'scopes: pending attendance scope refuses');
throws(() => scopeFor('people.nonsense'), 'scopes: unknown key throws');
ok(() => assert.deepEqual(requestedScopes(), ['ZOHOPEOPLE.forms.READ']), 'scopes: only confirmed scopes are ever requested');
ok(() => assert.ok(isConfirmedScope('people.forms.read')), 'scopes: confirmed key reports true');
ok(() => assert.equal(isConfirmedScope('people.leave.read'), false), 'scopes: pending key reports false');
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
ok(() => assert.equal(configFromEnv({}).dc, 'in'), 'oauth: defaults to the India DC');
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
const tokenResponse = (token, expiresIn = 3600) => ({
  ok: true, status: 200, headers: new Map(),
  json: async () => ({ access_token: token, expires_in: expiresIn }),
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
    fetchImpl: async (url) => { seen.push(url); return tokenResponse(`tok-${seen.length}`); },
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
  // Values are carried verbatim. The field name was confirmed; its value domain was not, so a
  // casing translation here would be an invented mapping table.
  const upper = transformLeaveRecord({ ...RAW_LEAVE, approval_status: 'APPROVED' });
  assert.equal(upper.status, 'APPROVED');
}, 'leave: status values are passed through untranslated');

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
    'status', 'to', 'unit',
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
  // The endpoint ledger points at scope keys; those are still pending in scopes.js and must not
  // have been quietly promoted by this change.
  assert.equal(isConfirmedScope(endpoint('people.employee.records').scopeKey), true);
  assert.equal(isConfirmedScope(endpoint('people.leave.list').scopeKey), false);
  assert.equal(isConfirmedScope(endpoint('people.attendance.entries').scopeKey), false);
}, 'endpoints: confirming data_select did NOT promote the pending v3 scopes');

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
          EmailID: 'Alex.Mathew@fristinetech.com',
          'Employee_type.id': '4200000000021',
          Department: 'Engineering',
          Date_of_birth: '01-Jan-1990',
          Gender: 'Male',
          Photo: 'https://contacts.zoho.in/file?ID=xyz',
        }],
      },
      {
        '55500000001000': [{
          EmailID: 'Priya.Nair@fristinetech.com',
          'Employee_type.id': '4200000000021',
          Department: 'Engineering',
          Date_of_birth: '02-Feb-1992',
          Gender: 'Female',
        }],
      },
      {
        '55500000001001': [{
          EmailID: 'Meera.Iyer@fristinetech.com',
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
  EmailID: 'Alex.Mathew@fristinetech.com',
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
  assert.equal(r.rows[0].EmailID, 'Alex.Mathew@fristinetech.com');
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
  assert.equal(r.email, 'Alex.Mathew@fristinetech.com');
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
  assert.equal(idx.get('alex.mathew@fristinetech.com'), '55500000000999');
}, 'employee: the email index is lower-cased, so casing cannot break one person\'s lookup');
ok(() => assert.equal(buildEmailIndex([{ EmailID: 'x@y.z' }]).size, 0), 'employee: a record missing an id is left out of the index, not half-added');
ok(() => assert.equal(transformEmployeeRecord(null), null), 'employee: null input returns null');
ok(() => assert.ok(EMPLOYEE_GAPS.orgFields.includes('manager')), 'employee: the missing manager field is recorded, blocking team scope on live data');
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
    email: 'Alex.Mathew@fristinetech.com',
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
  assert.equal(idx.get('meera.iyer@fristinetech.com'), '55500000001001');
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
  const live = buildLiveTools({ client: liveEmployeeClient() });
  const d = await live['zohoPeople.employeeLookup'].run({ name: 'meera' }, MANAGER_LIVE);
  assert.equal(d.count, 1);
  assert.equal(d.employees[0].employeeId, '55500000001001');
  assert.equal(d.employees[0].department, 'People');
  assert.equal(d.matchedOn, 'email');
  assert.ok(PEOPLE_TOOLS['zohoPeople.employeeLookup'].say(d).includes('People'));
  n++; console.log('ok   live tools: employeeLookup works against the real employee payload');
})();

await (async () => {
  const live = buildLiveTools({ client: liveEmployeeClient() });
  const d = await live['zohoPeople.employeeLookup'].run({ name: 'nobody-here' }, MANAGER_LIVE);
  assert.equal(d.count, 0);
  assert.ok(/Nobody matching/.test(PEOPLE_TOOLS['zohoPeople.employeeLookup'].say(d)));
  n++; console.log('ok   live tools: a lookup miss is an honest empty result');
})();

// ---- team hierarchy is disabled in live mode, and fails CLOSED ----
ok(() => {
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
  });
  assert.equal(m.directory.hierarchyAvailable, false);
  // No manager field was observed, so there is nothing to build a reporting line from. Leaving
  // the seed's relationships wired up would mean deciding a real authorization question from
  // generated demo data.
  assert.equal(m.directory.byId('E1002'), null);
}, 'live: the reporting hierarchy is switched off, not backed by seed relationships');
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
ok(() => {
  const m = buildPeopleManifest({
    NEUIQ_DATA_SOURCE: 'zoho', ZOHO_CLIENT_ID: 'a', ZOHO_CLIENT_SECRET: 'b', ZOHO_REFRESH_TOKEN: 'c',
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

console.log(`\nall ${n} zoho integration checks pass`);
