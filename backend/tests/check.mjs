/**
 * One runnable check for the backend.
 *
 *   node tests/check.mjs
 *
 * No framework: assertions against the real modules, exit 1 on any failure. What is asserted is
 * chosen deliberately — the things that are SECURITY BOUNDARIES rather than the things that are
 * easy to test. If the whitelist stops rejecting, or scoping stops applying, that must fail
 * loudly rather than quietly widen what a caller can reach.
 */
import assert from 'node:assert/strict';
import { sanitize, runQuery, schemaFor, SOURCES, isAdmin } from '../functions/neuiq_api/src/dashboards/query.service.js';
import { cleanWidgets, cleanTitle, WIDGET_TYPES } from '../functions/neuiq_api/src/dashboards/spec.js';
import { keywordSpec } from '../functions/neuiq_api/src/dashboards/builder.js';
import { TOOLS, mayCall, validateArgs, catalogue } from '../functions/neuiq_api/src/services/zoho-people/tools/index.js';
import { keywordRoute, answer } from '../functions/neuiq_api/src/orchestrator/index.js';
import { issueToken, verifyToken } from '../functions/neuiq_api/src/middleware/index.js';
import { buildSeed } from '../functions/neuiq_api/src/services/zoho-people/seed.js';

let n = 0;
const ok = (fn, what) => { fn(); n++; console.log('ok  ', what); };
const throws = (fn, what) => { assert.throws(fn); n++; console.log('ok  ', what); };

const EMPLOYEE = { employeeId: 'E1001', username: 'alex', role: 'employee' };
const MANAGER = { employeeId: 'E1003', username: 'rohit', role: 'manager' };
const ADMIN = { employeeId: 'E1004', username: 'meera', role: 'hr_admin' };

// ---------------------------------------------------------------- seed
const seed = buildSeed();
ok(() => assert.equal(seed.employees.length, 50), 'seed: 50 employees');
ok(() => assert.ok(seed.leave.length > 100), 'seed: leave records generated');
ok(() => {
  // Coherence: every derived row points at an employee that exists.
  const ids = new Set(seed.employees.map((e) => e.employeeId));
  for (const l of seed.leave) assert.ok(ids.has(l.employeeId));
  for (const a of seed.attendance) assert.ok(ids.has(a.employeeId));
}, 'seed: every leave/attendance row belongs to a real employee');
ok(() => {
  const a = buildSeed(); const b = buildSeed();
  assert.deepEqual(a.leave.length, b.leave.length);
  assert.deepEqual(a.leave[0], b.leave[0]);
}, 'seed: deterministic across runs');

// ---------------------------------------------------------------- sanitize
ok(() => assert.equal(sanitize({ source: 'nope' }), null), 'sanitize: unknown source -> null');
ok(() => assert.equal(sanitize({ source: 'leave', groupBy: 'salary' }).groupBy, undefined), 'sanitize: ungrouped field dropped');
ok(() => assert.equal(sanitize({ source: 'leave', field: 'secret' }).field, undefined), 'sanitize: unknown measure dropped');
ok(() => assert.equal(sanitize({ source: 'leave', limit: 9999 }).limit, 50), 'sanitize: limit clamped');
ok(() => assert.equal(sanitize({ source: 'leave', metric: 'sum' }).metric, 'count'), 'sanitize: sum with no field -> count');
ok(() => assert.equal(sanitize({ source: 'leave', filter: [{ field: 'x', op: 'eq', value: 1 }] }).filter, undefined), 'sanitize: unknown filter field dropped');
ok(() => assert.equal(sanitize({ source: 'leave', filter: [{ field: 'days', op: 'DROP', value: 1 }] }).filter[0].op, 'eq'), 'sanitize: bad op coerced');
ok(() => {
  for (const [key, def] of Object.entries(SOURCES)) {
    const c = sanitize({ source: key, groupBy: def.group[0], field: def.numeric[0], metric: 'sum' });
    assert.ok(def.group.includes(c.groupBy));
    if (c.field) assert.ok(def.numeric.includes(c.field));
  }
}, 'sanitize: every source admits only its own registered fields');

// ---------------------------------------------------------------- scoping
ok(() => assert.ok(schemaFor(EMPLOYEE).every((s) => s.source !== 'employees')), 'scope: admin-only source hidden from employee');
ok(() => assert.ok(schemaFor(ADMIN).some((s) => s.source === 'employees')), 'scope: admin sees it');
ok(() => assert.ok(schemaFor(ADMIN).every((s) => !('scope' in s))), 'scope: schema leaks no internals to the model');
throws(() => runQuery({ source: 'employees', groupBy: 'department' }, EMPLOYEE), 'scope: employee querying admin source -> throws 403');
ok(() => assert.equal(runQuery({ source: 'employees', groupBy: 'department' }, ADMIN).data.length > 0, true), 'scope: admin may query it');
ok(() => {
  // THE key assertion: the same spec returns fewer rows for an employee than for an admin,
  // because it is rewritten with an ownership filter before it runs.
  const mine = runQuery({ source: 'leave', metric: 'count' }, EMPLOYEE).data[0].value;
  const all = runQuery({ source: 'leave', metric: 'count' }, ADMIN).data[0].value;
  assert.ok(mine < all, `employee saw ${mine}, admin saw ${all}`);
}, 'scope: identical spec is narrowed for a non-admin at READ time');
ok(() => assert.equal(runQuery({ source: 'leave' }, EMPLOYEE).meta.scoped, true), 'scope: meta.scoped reports it');
ok(() => assert.equal(runQuery({ source: 'leave' }, ADMIN).meta.scoped, false), 'scope: admin reads unscoped');

// ---------------------------------------------------------------- query engine
ok(() => {
  const r = runQuery({ source: 'leave', groupBy: 'month', metric: 'sum', field: 'days' }, ADMIN);
  const labels = r.data.map((d) => d.name);
  assert.ok(labels.length >= 2);
  // A month grouping must stay in calendar order whatever `sort` says - a trend line with
  // shuffled months is worse than no chart.
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const idx = labels.map((l) => months.indexOf(l.split(' ')[0]) + Number(l.split(' ')[1]) * 12);
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
}, 'query: month grouping stays in calendar order');
ok(() => assert.ok(runQuery({ source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', limit: 2 }, ADMIN).data.length === 2), 'query: limit applied');
ok(() => {
  const desc = runQuery({ source: 'leave', groupBy: 'leaveType', metric: 'count', sort: 'desc' }, ADMIN).data;
  assert.ok(desc[0].value >= desc[desc.length - 1].value);
}, 'query: sort desc honoured');

// ---------------------------------------------------------------- widget specs
ok(() => assert.equal(cleanWidgets([{ type: 'sankey', title: 't', query: { source: 'leave', groupBy: 'status' } }])[0].type, 'bar'), 'spec: undrawable type -> bar');
ok(() => assert.equal(cleanWidgets([{ type: 'bar', query: { source: 'nope' } }]).length, 0), 'spec: dead query drops its widget');
ok(() => assert.equal(cleanWidgets([{ type: 'kpi' }])[0].title, 'Headline numbers'), 'spec: kpi needs no query');
ok(() => assert.equal(cleanWidgets(Array(40).fill({ type: 'kpi' })).length, 12), 'spec: capped at 12');
ok(() => assert.equal(cleanWidgets('nope').length, 0), 'spec: non-array is empty, not a throw');
ok(() => assert.equal(cleanTitle('   '), 'Dashboard'), 'spec: blank title falls back');
ok(() => cleanWidgets([{ type: 'kpi' }]).forEach((w) => assert.ok(WIDGET_TYPES.includes(w.type))), 'spec: surviving types are all renderable');

ok(() => {
  // `salary` is not a groupable field on `leave`. sanitize() keeps the rest of the query, which
  // is right for a READ - the analytics summary deliberately asks for a grand total with no
  // grouping - but wrong for a stored chart: what survives is a single bar under a title
  // promising a breakdown. It must be dropped instead.
  assert.equal(cleanWidgets([{ type: 'bar', title: 'By salary', query: { source: 'leave', groupBy: 'salary' } }]).length, 0);
  // A kpi tile carries no query, so the rule must not touch it.
  assert.equal(cleanWidgets([{ type: 'kpi' }]).length, 1);
}, 'spec: a chart whose grouping was stripped is dropped, not left as one bar');

// ---------------------------------------------------------------- builder
ok(() => assert.ok(keywordSpec('leave and attendance', ADMIN).widgets.length >= 3), 'builder: produces a multi-widget spec');
ok(() => assert.ok(keywordSpec('xyzzy', EMPLOYEE).widgets.length >= 2), 'builder: always returns something');
ok(() => {
  // An employee must never be handed a tile that would 403 the moment it resolves.
  const spec = keywordSpec('headcount by department', EMPLOYEE);
  for (const w of spec.widgets) if (w.query) assert.notEqual(w.query.source, 'employees');
}, 'builder: respects the caller scope');
ok(() => keywordSpec('everything', ADMIN).widgets.forEach((w) => { if (w.query) assert.ok(sanitize(w.query)); }), 'builder: output already passes the whitelist');

// ---------------------------------------------------------------- tools
ok(() => assert.ok(mayCall('zohoPeople.leaveBalance', EMPLOYEE)), 'tools: employee may read own leave');
ok(() => assert.equal(mayCall('zohoPeople.headcount', EMPLOYEE), false), 'tools: employee may NOT read headcount');
ok(() => assert.ok(mayCall('zohoPeople.headcount', ADMIN)), 'tools: admin may');
ok(() => assert.equal(mayCall('zohoPeople.teamOnLeave', EMPLOYEE), false), 'tools: team scope refused to an employee');
ok(() => assert.ok(mayCall('zohoPeople.teamOnLeave', MANAGER)), 'tools: manager has team scope');
throws(() => validateArgs('zohoPeople.leaveBalance', { nope: 1 }), 'tools: unknown parameter refused, not dropped');
throws(() => validateArgs('zohoPeople.employeeLookup', {}), 'tools: required parameter enforced');
ok(() => assert.equal(validateArgs('zohoPeople.leaveRecords', { limit: '5' }).limit, 5), 'tools: numeric arg coerced');
throws(() => TOOLS['zohoPeople.leaveBalance'].run({ employeeId: 'E1002' }, EMPLOYEE), 'tools: employee cannot read a colleague');
ok(() => assert.equal(TOOLS['zohoPeople.leaveBalance'].run({ employeeId: 'E1002' }, MANAGER).employeeId, 'E1002'), 'tools: manager CAN read a direct report');
throws(() => TOOLS['zohoPeople.leaveBalance'].run({ employeeId: 'E1005' }, MANAGER), 'tools: manager cannot read outside their line');
ok(() => assert.equal(TOOLS['zohoPeople.leaveBalance'].run({ employeeId: 'E1002' }, ADMIN).employeeId, 'E1002'), 'tools: admin may read anyone');
ok(() => assert.ok(catalogue(EMPLOYEE).some((t) => t.allowed === false)), 'tools: catalogue marks what is out of reach');

// ---------------------------------------------------------------- routing
ok(() => assert.equal(keywordRoute('how much casual leave do I have left?').tool, 'zohoPeople.leaveBalance'), 'route: leave balance');
ok(() => assert.equal(keywordRoute('how much casual leave do I have left?').args.leaveType, 'Casual'), 'route: leave type extracted');
ok(() => assert.equal(keywordRoute('who is on leave today?').tool, 'zohoPeople.teamOnLeave'), 'route: who is out');
ok(() => assert.equal(keywordRoute('my attendance last month').tool, 'zohoPeople.attendanceSummary'), 'route: attendance');
ok(() => assert.equal(keywordRoute('headcount by location').tool, 'zohoPeople.headcount'), 'route: headcount');
ok(() => assert.equal(keywordRoute('headcount by location').args.groupBy, 'location'), 'route: groupBy extracted');
ok(() => assert.equal(keywordRoute('what is the weather'), null), 'route: unmatched -> null');

// ---------------------------------------------------------------- orchestrator
const run = async () => {
  const a = await answer({ message: 'how much casual leave do I have left?', user: EMPLOYEE, requestId: 't1' });
  assert.equal(a.outcome, 'ok');
  assert.equal(a.tool, 'zohoPeople.leaveBalance');
  assert.ok(/days left/.test(a.answer), a.answer);
  assert.ok(a.pinnable, 'a chartable answer offers a pin');
  n++; console.log('ok   orchestrator: grounded answer, written by the tool');

  const refused = await answer({ message: 'headcount by department', user: EMPLOYEE, requestId: 't2' });
  assert.equal(refused.outcome, 'refused');
  assert.equal(refused.data, null);
  n++; console.log('ok   orchestrator: authorization refuses AFTER routing, returns no data');

  const allowed = await answer({ message: 'headcount by department', user: ADMIN, requestId: 't3' });
  assert.equal(allowed.outcome, 'ok');
  assert.ok(/50 employees/.test(allowed.answer), allowed.answer);
  n++; console.log('ok   orchestrator: same question answered for an admin');

  const vague = await answer({ message: 'hello there', user: EMPLOYEE, requestId: 't4' });
  assert.equal(vague.outcome, 'clarify');
  assert.equal(vague.tool, null);
  n++; console.log('ok   orchestrator: not-understood asks rather than guesses');

  const write = await answer({ message: 'delete all leave records', user: ADMIN, requestId: 't5' });
  assert.notEqual(write.outcome, 'ok');
  n++; console.log('ok   orchestrator: no write path to route to');

  await assert.rejects(() => answer({ message: '   ', user: EMPLOYEE, requestId: 't6' }));
  n++; console.log('ok   orchestrator: empty message rejected');
};

// ---------------------------------------------------------------- tokens
ok(() => {
  const e = seed.employees.find((x) => x.username === 'alex');
  const payload = verifyToken(issueToken(e));
  assert.equal(payload.employeeId, 'E1001');
  assert.equal(payload.role, 'employee');
}, 'auth: token round-trips');
ok(() => assert.equal(verifyToken('garbage'), null), 'auth: malformed token -> null, not a throw');
ok(() => {
  // A tampered role must not verify. This is the one thing the HMAC is actually for.
  const e = seed.employees.find((x) => x.username === 'alex');
  const [body] = issueToken(e).split('.');
  const forged = JSON.parse(Buffer.from(body, 'base64url').toString());
  forged.role = 'hr_admin';
  const tampered = `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${issueToken(e).split('.')[1]}`;
  assert.equal(verifyToken(tampered), null);
}, 'auth: a forged role fails signature verification');
ok(() => assert.equal(isAdmin({ role: 'manager' }), false), 'auth: manager is not admin');

await run();
console.log(`\nall ${n} backend checks pass`);
