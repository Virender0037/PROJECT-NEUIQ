/**
 * Scalability checks for the employee directory (E2.2 Part 6) — SYNTHETIC data only.
 *
 *   node --expose-gc tests/scale.check.mjs
 *
 * Runs the REAL paged client (people/client.js), the REAL shared snapshot and the REAL identity
 * directory against a fake Zoho that serves `getRecords` pages in the recorded live shape — raw
 * JSON text with unquoted 18-digit ids, so the precision-safe parser does its real work. No
 * network, no credentials.
 *
 * Asserted (exit 1 on failure): request counts, single-flight under concurrency, zero requests on
 * cache hits, no partial directory after a failed page, recovery after the cool-down, and the
 * 10,000-record ceiling. Printed but NOT asserted: timings and memory — they vary by machine and
 * are measurements of THIS run, not production guarantees. Nothing here is live validation: no
 * organisation larger than two employees has been observed through this code.
 */
import assert from 'node:assert/strict';
import { createPeopleClient, EMPLOYEE_PAGE_SIZE, DIRECTORY_MAX_RECORDS, DIRECTORY_MAX_PAGES, DIRECTORY_PAGE_RATE_LIMIT } from '../functions/neuiq_api/src/integrations/zoho/people/client.js';
import { createEmployeeSnapshot, SNAPSHOT_MAX_TTL_MS, SNAPSHOT_FAILURE_COOLDOWN_MS } from '../functions/neuiq_api/src/integrations/zoho/people/employeeSnapshot.js';
import { createEmployeeDirectory, LOOKUP } from '../functions/neuiq_api/src/integrations/zoho/people/employeeDirectory.js';
import { bindDeployment } from '../functions/neuiq_api/src/core/platform/deployment.js';
import { createRateLimiter } from '../functions/neuiq_api/src/integrations/zoho/_shared/rateLimiter.js';

let n = 0;
const ok = (what) => { n++; console.log('ok  ', what); };
const NS = 'test/zoho-com/scale-test';
bindDeployment({ namespace: NS, environment: 'test' });

const ID = (i) => `5550000003${String(i).padStart(8, '0')}`;
const ZUID = (i) => `7${String(i).padStart(8, '0')}`;
/** A ten-wide reporting tree: employee i reports to employee ceil(i/10) - 1 (employee 1 has no manager). */
const managerOf = (i) => (i <= 1 ? null : Math.max(1, Math.ceil(i / 10) - 1));

/** One `getRecords` page body, as Zoho sends it. */
function pageText(from, count) {
  const parts = [];
  for (let i = from; i < from + count; i++) {
    const m = managerOf(i);
    parts.push(`{"${ID(i)}":[{"Zoho_ID":${ID(i)},"ZUID":"${ZUID(i)}","Employeestatus":"Active","Reporting_To.ID":"${m && m !== i ? ID(m) : ''}","FirstName":"Test","LastName":"Person","EmailID":"e${i}@example.test","Department":"Dept${i % 7}","Employee_type.id":"4200000000021"}]}`);
  }
  return `{"response":{"result":[${parts.join(',')}],"message":"Data fetched successfully","uri":"/api/forms/employee/getRecords","status":0}}`;
}
const NO_RECORDS = '{"response":{"message":"Error occurred","uri":"/api/forms/employee/getRecords","errors":{"code":7024,"message":"No records found"},"status":1}}';

/** A client over a synthetic organisation of `size`; `fail(sIndex)` may return an HTTP status to fail a page. */
function fakeZoho(size, { fail = null, now = null } = {}) {
  const calls = [];
  const client = createPeopleClient({
    dc: 'com',
    // The REAL page limit (51/min); on the test clock when one is given, so simulated minutes pass.
    ...(now ? { directoryLimiter: createRateLimiter({ name: 'scale pages', ...DIRECTORY_PAGE_RATE_LIMIT, now }) } : {}),
    tokenProvider: { getAccessToken: async () => 'tok', invalidate: () => {} },
    logger: { log: () => {}, warn: () => {} },
    fetchImpl: async (url) => {
      const u = new URL(url);
      const sIndex = Number(u.searchParams.get('sIndex'));
      const limit = Number(u.searchParams.get('limit'));
      calls.push(sIndex);
      const status = fail?.(sIndex);
      if (status) return new Response('{"message":"unavailable"}', { status });
      const count = Math.max(0, Math.min(limit, size - sIndex + 1));
      return new Response(count ? pageText(sIndex, count) : NO_RECORDS, { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, calls };
}
const expectedRequests = (size) => Math.ceil(size / EMPLOYEE_PAGE_SIZE) + (size % EMPLOYEE_PAGE_SIZE === 0 ? 1 : 0);
const gc = () => { if (global.gc) { global.gc(); global.gc(); } };
const heap = () => process.memoryUsage().heapUsed;
const ms = (t0) => Number(process.hrtime.bigint() - t0) / 1e6;
const fmtMs = (v) => (v < 10 ? v.toFixed(2) : v.toFixed(0));

const SIZES = [2, 200, 500, 1000, 5000, 10000];
const rows = [];

for (const size of SIZES) {
  // ---- cold load: one walk, one index ----
  const zoho = fakeZoho(size);
  const snapshot = createEmployeeSnapshot({ loadRecords: () => zoho.client.employees(), namespace: () => NS });
  const directory = createEmployeeDirectory({ snapshot, namespace: () => NS });

  gc();
  const before = heap();
  let t0 = process.hrtime.bigint();
  const snap = await snapshot.get();
  const loadMs = ms(t0);
  t0 = process.hrtime.bigint();
  assert.equal((await directory.resolveZuid(ZUID(1))).ok, true);
  const indexMs = ms(t0);
  gc();
  const retainedMb = global.gc ? (heap() - before) / 1024 / 1024 : null;

  assert.equal(snap.size, size, `${size}: complete`);
  assert.equal(zoho.calls.length, expectedRequests(size), `${size}: requests per complete load`);
  assert.equal(snap.rows[size - 1].__recordId, ID(size), `${size}: the last 18-digit id is exact`);

  // ---- warm lookups: no requests ----
  const lookups = 10_000;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < lookups; i++) {
    const k = 1 + ((i * 7919) % size);
    const r = await directory.resolveZuid(ZUID(k));
    if (!r.ok) throw new Error(`lookup ${k} failed`);
  }
  const lookupUs = (ms(t0) * 1000) / lookups;
  t0 = process.hrtime.bigint();
  for (let i = 0; i < lookups; i++) await directory.reportsOf(ID(1 + ((i * 104729) % size)));
  const reportsUs = (ms(t0) * 1000) / lookups;
  const managers = await directory.reportsOf(ID(1));
  assert.ok(size < 2 || managers.reports.length > 0, `${size}: the reporting tree is indexed`);
  assert.equal(zoho.calls.length, expectedRequests(size), `${size}: ${lookups * 2} warm lookups made zero requests`);

  // ---- concurrency: 200 cold callers, one walk ----
  const zoho2 = fakeZoho(size);
  const snap2 = createEmployeeSnapshot({ loadRecords: () => zoho2.client.employees(), namespace: () => NS });
  const dir2 = createEmployeeDirectory({ snapshot: snap2, namespace: () => NS });
  const results = await Promise.all(Array.from({ length: 200 }, (_, i) => dir2.resolveZuid(ZUID(1 + (i % size)))));
  assert.ok(results.every((r) => r.ok), `${size}: every concurrent caller answered`);
  assert.equal(snap2.status().loads, 1, `${size}: 200 concurrent cold callers -> one load`);
  assert.equal(zoho2.calls.length, expectedRequests(size), `${size}: and one walk`);

  rows.push({ size, requests: zoho.calls.length, loadMs, indexMs, retainedMb, lookupUs, reportsUs });
}
ok(`scale: 2 / 200 / 500 / 1,000 / 5,000 / 10,000 employees load completely with ceil(n/200) requests (+1 end read on an exact multiple); 20,000 warm lookups each make 0 requests`);
ok('scale: 200 concurrent cold callers share ONE load at every size (single-flight)');

// ---- failure, no partial directory, cool-down, recovery ----
for (const size of [1000, 10000]) {
  let t = 1_000_000;
  let failing = true;
  const zoho = fakeZoho(size, { fail: (s) => (failing && s === 401 ? 503 : null), now: () => t });
  const snapshot = createEmployeeSnapshot({ loadRecords: () => zoho.client.employees(), namespace: () => NS, now: () => t });
  const directory = createEmployeeDirectory({ snapshot, namespace: () => NS });
  assert.deepEqual(await directory.resolveZuid(ZUID(1)), { ok: false, reason: LOOKUP.UNAVAILABLE }, `${size}: page 3 failed — unavailable, not pages 1-2`);
  assert.deepEqual(zoho.calls, [1, 201, 401], `${size}: the walk stopped at the failed page`);
  for (let i = 0; i < 100; i++) { t += 100; await directory.resolveZuid(ZUID(1)); }
  assert.equal(zoho.calls.length, 3, `${size}: 100 lookups during the cool-down made 0 requests (no request storm)`);
  failing = false;
  t += SNAPSHOT_FAILURE_COOLDOWN_MS;
  const budget = DIRECTORY_PAGE_RATE_LIMIT.limit;
  if (3 + expectedRequests(size) > budget) {
    // FINDING: at the maximum size one walk needs the whole per-minute page budget, so a retry
    // inside the same minute as the failed walk is refused LOCALLY (no Zoho call) — recovery waits
    // for the limiter window, not just the 30 s cool-down. Safe, but slower.
    assert.deepEqual(await directory.resolveZuid(ZUID(size)), { ok: false, reason: LOOKUP.UNAVAILABLE }, `${size}: over budget -> refused`);
    assert.ok(zoho.calls.length <= budget, `${size}: never more than ${budget} page requests in the window`);
    t += DIRECTORY_PAGE_RATE_LIMIT.windowMs + SNAPSHOT_FAILURE_COOLDOWN_MS;
  }
  assert.equal((await directory.resolveZuid(ZUID(size))).ok, true, `${size}: recovered after the cool-down (and the page budget)`);
  assert.equal(snapshot.status().records, size);
  // expiry: the next read after five minutes reloads; before it, none.
  const settled = zoho.calls.length;
  t += SNAPSHOT_MAX_TTL_MS - 1;
  await directory.resolveZuid(ZUID(1));
  assert.equal(zoho.calls.length, settled, `${size}: fresh for five minutes`);
  t += 1;
  await directory.resolveZuid(ZUID(1));
  assert.equal(zoho.calls.length, settled + expectedRequests(size), `${size}: reloaded at expiry`);
}
ok('scale: a failed middle page at 1,000 and 10,000 leaves the directory UNAVAILABLE (no partial data), 0 requests during the cool-down; 1,000 recovers right after it, 10,000 once the 51/min page budget allows a full walk; reload at the five-minute TTL');

// ---- the ceiling ----
{
  const at = fakeZoho(DIRECTORY_MAX_RECORDS);
  const s1 = createEmployeeSnapshot({ loadRecords: () => at.client.employees(), namespace: () => NS });
  assert.equal((await s1.get()).size, DIRECTORY_MAX_RECORDS);
  assert.equal(at.calls.length, DIRECTORY_MAX_PAGES + 1, 'exactly the ceiling: 50 full pages + the end read');
  const over = fakeZoho(DIRECTORY_MAX_RECORDS + 1);
  const s2 = createEmployeeSnapshot({ loadRecords: () => over.client.employees(), namespace: () => NS });
  const err = await s2.get().then(() => null, (e) => e);
  assert.equal(err?.code, 'PAGINATION_PAGE_LIMIT', 'one record over the ceiling is refused, not truncated');
  assert.equal(s2.status().loaded, false);
  assert.ok(DIRECTORY_PAGE_RATE_LIMIT.limit >= DIRECTORY_MAX_PAGES + 1, 'the local page limiter admits one full walk per minute');
}
ok('scale: exactly 10,000 employees load (51 requests); 10,001 are refused whole (PAGINATION_PAGE_LIMIT), never truncated');

// ---- report ----
console.log('\nMeasured on this machine (synthetic data, single process; timings vary by hardware):');
console.log('| employees | requests / load | load + parse ms | index build ms | retained heap MB | resolveZuid µs | reportsOf µs |');
console.log('|---:|---:|---:|---:|---:|---:|---:|');
for (const r of rows) {
  console.log(`| ${r.size.toLocaleString('en')} | ${r.requests} | ${fmtMs(r.loadMs)} | ${fmtMs(r.indexMs)} | ${r.retainedMb === null ? 'n/a (run with --expose-gc)' : r.retainedMb.toFixed(2)} | ${r.lookupUs.toFixed(2)} | ${r.reportsUs.toFixed(2)} |`);
}

// Estimates, not measurements: assumes demand at least once per TTL all day, ONE instance, and one
// token refresh per hour (Zoho access tokens last 3600 s). The E2 directory, employees source,
// headcount and lookup all share the one snapshot, so this is the whole employee-list cost.
console.log('\nEstimated Zoho calls per day (estimate — continuous demand, one instance, + ~24 token refreshes):');
console.log('| employees | per load | TTL 5 min (288 loads) | TTL 15 min (96) | TTL 60 min (24) |');
console.log('|---:|---:|---:|---:|---:|');
for (const size of SIZES) {
  const r = expectedRequests(size);
  console.log(`| ${size.toLocaleString('en')} | ${r} | ${(r * 288 + 24).toLocaleString('en')} | ${(r * 96 + 24).toLocaleString('en')} | ${(r * 24 + 24).toLocaleString('en')} |`);
}

console.log(`\nall ${n} scale checks pass`);
