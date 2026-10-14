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

// The composition root, first: it registers every integration's tools and sources into core.
// Everything below reads one of those registries, so this import has to run before they do.
import '../functions/neuiq_api/src/integrations/registry.js';

import { sanitize, runQuery } from '../functions/neuiq_api/src/core/query/engine.js';
import { schemaFor, SOURCES } from '../functions/neuiq_api/src/core/query/sources.js';
import { isAdmin } from '../functions/neuiq_api/src/core/policy/roles.js';
import { cleanWidgets, cleanTitle, WIDGET_TYPES } from '../functions/neuiq_api/src/core/dashboards/spec.js';
import { keywordSpec } from '../functions/neuiq_api/src/core/dashboards/builder.js';
import {
  TOOLS, mayCall, validateArgs, catalogue, registerTools, assertResultAllowed,
} from '../functions/neuiq_api/src/core/tools/registry.js';
import {
  allowedEmployeeIds, teamOf, assertRowsWithin, isWithin, resolveSubject, ANY_EMPLOYEE,
} from '../functions/neuiq_api/src/core/policy/authorize.js';
import {
  PERSON_FIELDS, ON_LEAVE_FIELDS, LEAVE_RECORD_FIELDS,
} from '../functions/neuiq_api/src/integrations/zoho/people/tools/index.js';
import { keywordRoute, answer } from '../functions/neuiq_api/src/core/orchestrator/index.js';
import { issueToken, verifyToken } from '../functions/neuiq_api/src/core/auth/session.js';
import { buildSeed, onLeaveToday } from '../functions/neuiq_api/src/integrations/zoho/people/seed.js';
import { resolveDataSource, publicDataSource } from '../functions/neuiq_api/src/integrations/zoho/people/dataSource.js';
import { createApp } from '../functions/neuiq_api/src/app.js';
import { resolveAuthMode } from '../functions/neuiq_api/src/core/auth/mode.js';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LEAVE_STATUS, countWithStatus } from '../functions/neuiq_api/src/integrations/zoho/people/leaveStatus.js';

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

// ---------------------------------------------------------------- tool-level authorization
// Who may see whose records, decided once and enforced on what tools RETURN, not only on who may
// call them. Before this, `scope: 'team'` let any manager call teamOnLeave and employeeLookup —
// and both then returned the whole organisation.
const MANAGER_2 = { employeeId: 'E1005', username: 'arjun', role: 'manager' };
const reportsOf = (id) => seed.employees.filter((e) => e.managerId === id).map((e) => e.employeeId);
const orgOnLeave = () => seed.leave.filter((l) => l.status === 'Approved' && l.month === '2026-09');
const status = (fn) => { try { fn(); } catch (e) { return e.status; } return 'no throw'; };

ok(() => {
  const a = allowedEmployeeIds(EMPLOYEE);
  assert.deepEqual([...a], ['E1001']);
}, 'authz: an employee may see only themselves');
ok(() => {
  const a = allowedEmployeeIds(MANAGER);
  assert.deepEqual([...a].sort(), ['E1003', ...reportsOf('E1003')].sort());
  assert.equal(a.has('E1049'), false);  // arjun's report, not rohit's
  assert.equal(a.has('E1005'), false);  // rohit's own manager
}, 'authz: a manager may see themselves and their DIRECT reports only');
ok(() => assert.equal(allowedEmployeeIds(ADMIN), ANY_EMPLOYEE), 'authz: an HR admin may see everyone');
ok(() => {
  // Rank alone is not reach: a forged-looking user with a manager role but no reports gets self.
  assert.deepEqual([...allowedEmployeeIds({ employeeId: 'E1001', role: 'manager' })], ['E1001']);
  assert.equal(allowedEmployeeIds({ employeeId: 'E1001', role: 'Admin' }) === ANY_EMPLOYEE, false);
  assert.deepEqual([...allowedEmployeeIds({})], []);
}, 'authz: reach comes from the reporting line, and only role hr_admin is admin');
ok(() => {
  assert.equal(isWithin(new Set(['E1']), 'E1'), true);
  // Nothing a caller can supply stands in for "everyone".
  for (const fake of ['*', 'ALL', { any: true }, null, undefined, [ 'E1' ]]) {
    assert.equal(isWithin(fake, 'E1'), false);
  }
}, 'authz: only the ANY_EMPLOYEE sentinel itself means everyone');

// teamOnLeave (G1)
ok(() => {
  const d = TOOLS['zohoPeople.teamOnLeave'].run({}, MANAGER);
  const team = new Set(reportsOf('E1003'));
  assert.ok(d.people.length > 0);
  for (const p of d.people) assert.ok(team.has(p.employeeId), p.employeeId);
  // meera (E1004) is on leave this month and is NOT rohit's report. Before scoping she was listed.
  assert.ok(orgOnLeave().some((l) => l.employeeId === 'E1004'));
  assert.equal(d.people.some((p) => p.employeeId === 'E1004'), false);
}, 'teamOnLeave: a manager sees only their direct reports');
ok(() => {
  const d = TOOLS['zohoPeople.teamOnLeave'].run({}, MANAGER_2);
  const team = new Set(reportsOf('E1005'));
  for (const p of d.people) assert.ok(team.has(p.employeeId), p.employeeId);
  // Two managers, two different answers to the same question.
  const rohit = TOOLS['zohoPeople.teamOnLeave'].run({}, MANAGER).people.map((p) => p.employeeId);
  assert.equal(d.people.some((p) => rohit.includes(p.employeeId)), false);
}, "teamOnLeave: a second manager sees their own team, not the first manager's");
ok(() => {
  // Filtering happens before the cap of six, so out-of-scope people cannot crowd out the team.
  const d = TOOLS['zohoPeople.teamOnLeave'].run({}, MANAGER);
  const teamRows = orgOnLeave().filter((l) => reportsOf('E1003').includes(l.employeeId));
  assert.equal(d.people.length, Math.min(6, teamRows.length));
}, 'teamOnLeave: the team is filtered before the six-result cap, not after');
ok(() => {
  const d = TOOLS['zohoPeople.teamOnLeave'].run({}, ADMIN);
  assert.ok(d.people.some((p) => p.employeeId === 'E1004'));
}, 'teamOnLeave: an HR admin sees the whole organisation');
ok(() => assert.equal(mayCall('zohoPeople.teamOnLeave', EMPLOYEE), false), 'teamOnLeave: still refused to an employee');

// employeeLookup (G2)
ok(() => {
  // "Vikram" is a common seed name, with matches inside and outside rohit's line.
  const all = seed.employees.filter((e) => e.firstName === 'Vikram').map((e) => e.employeeId);
  const d = TOOLS['zohoPeople.employeeLookup'].run({ name: 'vikram' }, MANAGER);
  const reach = new Set(['E1003', ...reportsOf('E1003')]);
  assert.ok(d.count > 0);
  for (const e of d.employees) assert.ok(reach.has(e.employeeId), e.employeeId);
  assert.ok(all.some((id) => !reach.has(id)), 'fixture: a Vikram outside the line must exist');
}, 'employeeLookup: a manager finds only themselves and their direct reports');
ok(() => {
  // meera is an HR admin in another department, outside rohit's line.
  assert.equal(TOOLS['zohoPeople.employeeLookup'].run({ name: 'meera' }, MANAGER).count, 0);
  assert.equal(TOOLS['zohoPeople.employeeLookup'].run({ name: 'rohit' }, MANAGER).count, 1);
}, 'employeeLookup: a manager cannot find someone outside their line, but can find themselves');
ok(() => assert.equal(TOOLS['zohoPeople.employeeLookup'].run({ name: 'meera' }, ADMIN).count, 1), 'employeeLookup: an HR admin may search the organisation');
ok(() => assert.equal(mayCall('zohoPeople.employeeLookup', EMPLOYEE), false), 'employeeLookup: an employee gets no organisation-wide search');

// field allow-lists (data minimisation)
ok(() => {
  for (const p of TOOLS['zohoPeople.teamOnLeave'].run({}, ADMIN).people) assert.deepEqual(Object.keys(p), ON_LEAVE_FIELDS);
  for (const e of TOOLS['zohoPeople.employeeLookup'].run({ name: 'a' }, ADMIN).employees) assert.deepEqual(Object.keys(e), PERSON_FIELDS);
  for (const r of TOOLS['zohoPeople.leaveRecords'].run({}, EMPLOYEE).records) assert.deepEqual(Object.keys(r), LEAVE_RECORD_FIELDS);
}, 'fields: every person-shaped result is exactly its allow-list');
ok(() => {
  // The seed record carries managerId, username and role. None of them may leave a tool.
  const out = JSON.stringify(TOOLS['zohoPeople.employeeLookup'].run({ name: 'a' }, ADMIN));
  for (const leak of ['managerId', 'username', '"role"', 'firstName', 'lastName']) assert.equal(out.includes(leak), false, leak);
}, 'fields: no raw-record field (managerId, username, role) leaks through a lookup');

// unauthorised employee ids and malicious arguments
ok(() => {
  const run = (args, user) => () => TOOLS['zohoPeople.leaveBalance'].run(args, user);
  assert.equal(status(run({ employeeId: 'E1049' }, MANAGER)), 403);   // another manager's report
  assert.equal(status(run({ employeeId: 'E1005' }, MANAGER)), 403);   // your own manager
  assert.equal(status(run({ employeeId: 'E1003' }, EMPLOYEE)), 403);  // an employee reading their manager
  for (const evil of ['*', 'ALL', 'all', ' E1002', 'E1002 ', 'e1002', 'E1002,E1049', '[object Object]', 'NaN', 'undefined']) {
    assert.equal(status(run({ employeeId: evil }, EMPLOYEE)), 403, evil);
  }
}, 'malicious args: wildcards, lists, padding and case variants of an employee id are refused');
ok(() => {
  for (const evil of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'role', 'scope', 'user']) {
    const args = JSON.parse(`{"${evil}": {"role": "hr_admin"}}`);
    const e = (() => { try { validateArgs('zohoPeople.leaveBalance', args); } catch (err) { return err; } })();
    assert.equal(e?.status, 400, evil);
  }
}, 'malicious args: inherited names (__proto__, constructor) and smuggled role/scope keys are 400s');
ok(() => {
  // A parameter a tool does not declare cannot be used to widen it.
  assert.equal(status(() => validateArgs('zohoPeople.teamOnLeave', { employeeId: 'E1049' })), 400);
  assert.equal(status(() => validateArgs('zohoPeople.employeeLookup', { name: 'a', all: 'true' })), 400);
}, 'malicious args: team tools take no subject parameter to point elsewhere');
ok(() => {
  // A validated object argument becomes a string, so it is just another unknown id.
  const args = validateArgs('zohoPeople.leaveBalance', { employeeId: { toString: () => 'E1002' } });
  assert.equal(typeof args.employeeId, 'string');
  assert.equal(status(() => TOOLS['zohoPeople.leaveBalance'].run(args, EMPLOYEE)), 403);
}, "malicious args: an object posing as an id is coerced to a string and still refused");

// out-of-scope returned rows
ok(() => {
  assert.equal(status(() => assertRowsWithin([{ employeeId: 'E1049' }], allowedEmployeeIds(MANAGER))), 500);
  assert.equal(status(() => assertRowsWithin([{ employeeId: 'E1002' }], allowedEmployeeIds(MANAGER))), 'no throw');
  assert.equal(status(() => assertRowsWithin([{ employeeId: 'E1049' }], allowedEmployeeIds(ADMIN))), 'no throw');
}, 'rows: a row outside the caller\'s scope is a 500; inside, or for an admin, it passes');
ok(() => {
  // A row the check cannot attribute is a row it cannot clear.
  assert.equal(status(() => assertRowsWithin([{ name: 'x' }], allowedEmployeeIds(MANAGER))), 500);
  assert.equal(status(() => assertRowsWithin([{ employeeId: null }], allowedEmployeeIds(MANAGER))), 500);
  assert.equal(status(() => assertRowsWithin('nope', allowedEmployeeIds(MANAGER))), 500);
}, 'rows: a row with no employee id, or a non-array, fails closed');
ok(() => {
  assert.equal(status(() => assertResultAllowed('zohoPeople.teamOnLeave', { people: [{ employeeId: 'E1004' }] }, MANAGER)), 500);
  assert.equal(status(() => assertResultAllowed('zohoPeople.leaveBalance', { employeeId: 'E1002', balances: [] }, EMPLOYEE)), 500);
  assert.equal(status(() => assertResultAllowed('zohoPeople.employeeLookup', { employees: [{ employeeId: 'E1002' }] }, MANAGER)), 'no throw');
}, 'rows: assertResultAllowed checks each tool by its declared subjectRows');
ok(() => {
  for (const [name, t] of Object.entries(TOOLS)) assert.equal(typeof t.subjectRows, 'function', name);
  assert.throws(() => registerTools({ 'test.unchecked': { scope: 'self', params: {}, run: () => ({}), say: () => '' } }), /subjectRows/);
  assert.equal(TOOLS['test.unchecked'], undefined);
}, 'rows: a tool that does not declare subjectRows cannot be registered');
ok(() => {
  // resolveSubject and the result check read the same rule, so they cannot disagree.
  for (const u of [EMPLOYEE, MANAGER, MANAGER_2]) {
    const allowed = allowedEmployeeIds(u);
    for (const e of seed.employees) {
      assert.equal(status(() => resolveSubject(u, e.employeeId)) !== 403, allowed.has(e.employeeId), `${u.username}->${e.employeeId}`);
    }
  }
}, 'authz: resolveSubject agrees with allowedEmployeeIds for every caller and every employee');

// /chat: the same checks, end to end
const runChat = async () => {
  const rohit = await answer({ message: 'who is on leave today?', user: MANAGER, requestId: 'z1' });
  assert.equal(rohit.tool, 'zohoPeople.teamOnLeave');
  const team = new Set(reportsOf('E1003'));
  for (const p of rohit.data.people) assert.ok(team.has(p.employeeId));
  assert.equal(rohit.answer.includes('Meera'), false);
  n++; console.log('ok   chat: "who is on leave" answers a manager with their team only');

  const meera = await answer({ message: 'who is on leave today?', user: ADMIN, requestId: 'z2' });
  assert.ok(meera.data.people.some((p) => p.employeeId === 'E1004'));
  n++; console.log('ok   chat: the same question answers an HR admin organisation-wide');

  const alex = await answer({ message: 'who is on leave today?', user: EMPLOYEE, requestId: 'z3' });
  assert.equal(alex.outcome, 'refused');
  assert.equal(alex.data, null);
  n++; console.log('ok   chat: an employee asking who is on leave is refused, with no data');

  // A tool that forgets its own filter must still be caught on the chat path.
  const tool = TOOLS['zohoPeople.teamOnLeave'];
  const original = tool.run;
  tool.run = () => ({ date: '2026-09-04', people: [{ employeeId: 'E1049', name: 'x', leaveType: 'Casual', days: 1 }] });
  try {
    await assert.rejects(
      () => answer({ message: 'who is on leave today?', user: MANAGER, requestId: 'z4' }),
      (e) => e.status === 500,
    );
  } finally {
    tool.run = original;
  }
  n++; console.log('ok   chat: a tool returning an out-of-scope row is stopped before the response (500)');
};

// ---------------------------------------------------------------- leave status: seed regression
// Step 11.6 replaced every `=== 'Approved'` with the shared rule. The seed already emits the
// normalised labels, so every seed figure must be exactly what the literal comparison produced.
ok(() => {
  const literal = (id, type) => seed.leave
    .filter((l) => l.employeeId === id && l.leaveType === type && l.status === 'Approved' && l.month.startsWith('2026'))
    .reduce((s, l) => s + l.days, 0);
  for (const e of seed.employees) {
    const d = TOOLS['zohoPeople.leaveBalance'].run({ employeeId: e.employeeId }, ADMIN);
    for (const b of d.balances) assert.equal(b.taken, Math.round(literal(e.employeeId, b.leaveType) * 10) / 10, `${e.employeeId} ${b.leaveType}`);
  }
}, 'leave status (seed): every leave balance equals the old literal-Approved figure');
ok(() => {
  const literal = seed.leave.filter((l) => l.status === 'Approved' && l.month === '2026-09').slice(0, 6).map((l) => l.employeeId);
  assert.deepEqual(onLeaveToday(seed).map((p) => p.employeeId), literal);
}, 'leave status (seed): onLeaveToday is unchanged');
ok(() => {
  const counts = ['Approved', 'APPROVED', 'approved'].map((s) => TOOLS['zohoPeople.leaveRecords'].run({ status: s, limit: 50 }, EMPLOYEE).count);
  assert.equal(new Set(counts).size, 1);
  assert.ok(counts[0] > 0);
}, 'leave status (seed): a status filter matches regardless of case');
ok(() => {
  const pendingRows = seed.leave.filter((l) => l.status === 'Pending');
  const all = runQuery({ source: 'leave', groupBy: 'status', metric: 'count' }, ADMIN).data;
  assert.equal(countWithStatus(all, LEAVE_STATUS.PENDING), pendingRows.length);
  const mine = runQuery({ source: 'leave', groupBy: 'status', metric: 'count' }, EMPLOYEE).data;
  assert.equal(countWithStatus(mine, LEAVE_STATUS.PENDING), pendingRows.filter((l) => l.employeeId === 'E1001').length);
}, "leave status (seed): the analytics pending count matches the seed, scoped to the caller");

// ---------------------------------------------------------------- dataSource on /health and /me
// The UI says "Demo data" from what the backend REPORTS. Exercised over real HTTP on an ephemeral
// local port, in-process: no Zoho, no dev server.
ok(() => {
  assert.equal(publicDataSource(resolveDataSource({ NEUIQ_DATA_SOURCE: 'seed' })), 'seed');
  assert.equal(publicDataSource(resolveDataSource({})), 'seed');           // unset = seed in development
  assert.equal(publicDataSource(resolveDataSource({ NEUIQ_DATA_SOURCE: 'zoho' })), 'zoho');
  assert.equal(publicDataSource(resolveDataSource({ NEUIQ_DATA_SOURCE: 'ZOHO' })), 'zoho');
  for (const junk of [null, undefined, {}, { source: 'zoho' }, { isZoho: true }, { source: 'live', isZoho: true }]) {
    assert.equal(publicDataSource(junk), null, JSON.stringify(junk));
  }
}, 'dataSource: only a real seed/zoho resolution is reported; anything else is null, never "zoho"');

const runHttp = async () => {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  try {
    const health = await (await fetch(`${base}/health`)).json();
    assert.equal(health.dataSource, 'seed');
    // CHANGED in Phase 5.2: `authMode` joined the response (and `employees` is now demo-only).
    assert.deepEqual(Object.keys(health).sort(), ['authMode', 'dataSource', 'employees', 'model', 'requestId', 'status', 'success']);
    n++; console.log('ok   dataSource: /health reports "seed", unauthenticated, and nothing else new');

    const login = await (await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'meera' }),
    })).json();
    const me = await (await fetch(`${base}/me`, { headers: { authorization: `Bearer ${login.token}` } })).json();
    assert.equal(me.dataSource, 'seed');
    assert.equal(me.user.employeeId, 'E1004');
    assert.equal('dataSource' in me.user, false);              // beside the user, not inside it
    n++; console.log('ok   dataSource: /me reports it beside the authenticated user');

    const anon = await fetch(`${base}/me`);
    assert.equal(anon.status, 401);
    n++; console.log('ok   dataSource: /me still requires a token');

    // Nothing from configuration rides along: no env var names, no secret-shaped values.
    const bodies = JSON.stringify([health, me]);
    for (const leak of ['ZOHO_', 'NEUIQ_', 'AUTH_SECRET', 'clientId', 'refresh', 'token":"', 'people.zoho', 'accounts.zoho']) {
      assert.equal(bodies.includes(leak), false, leak);
    }
    n++; console.log('ok   dataSource: no configuration, credential or host leaks into /health or /me');
  } finally {
    await new Promise((r) => server.close(r));
  }
};

// ---------------------------------------------------------------- auth mode (Phase 5.2)
// Demo login has no password. It must exist only over seed data, outside production, and never
// when the backend says zoho — enforced by the backend whatever the frontend shows.
const modeOf = (env, dataSource) => { try { return resolveAuthMode(env, { dataSource }).mode; } catch (e) { return `refused: ${e.message}`; } };
const refused = (v) => typeof v === 'string' && v.startsWith('refused');

ok(() => {
  assert.equal(modeOf({}, 'seed'), 'demo');                                    // seed + unset
  assert.equal(modeOf({ NEUIQ_AUTH_MODE: '' }, 'seed'), 'demo');               // empty is unset
  assert.equal(modeOf({ NEUIQ_AUTH_MODE: 'demo' }, 'seed'), 'demo');
  assert.equal(modeOf({ NEUIQ_AUTH_MODE: 'zoho' }, 'seed'), 'zoho');
  assert.equal(modeOf({ NEUIQ_AUTH_MODE: ' Zoho ' }, 'seed'), 'zoho');         // trimmed, case-insensitive
  assert.equal(modeOf({ NEUIQ_AUTH_MODE: 'zoho' }, 'zoho'), 'zoho');
  assert.equal(modeOf({ NEUIQ_AUTH_MODE: 'zoho', NODE_ENV: 'production' }, 'zoho'), 'zoho');
}, 'auth mode: seed+unset is demo (unchanged); seed+demo, seed+zoho and zoho+zoho are allowed');
ok(() => {
  assert.ok(refused(modeOf({}, 'zoho')), 'zoho data + unset');
  assert.ok(refused(modeOf({ NEUIQ_AUTH_MODE: 'demo' }, 'zoho')), 'zoho data + demo');
  assert.ok(refused(modeOf({}, null)), 'unknown data source + unset');
  assert.ok(refused(modeOf({ NEUIQ_AUTH_MODE: 'demo' }, null)), 'unknown data source + demo');
}, 'auth mode: live (or unknown) data refuses demo login and refuses an unset mode');
ok(() => {
  assert.ok(refused(modeOf({ NEUIQ_AUTH_MODE: 'demo', NODE_ENV: 'production' }, 'seed')));
  assert.ok(refused(modeOf({ NODE_ENV: 'Production' }, 'seed')), 'unset defaults to demo, which production refuses');
}, 'auth mode: production refuses demo, including the implicit default');
ok(() => {
  for (const bad of ['oidc', 'none', 'true', 'off', 'demo,zoho', 'sso', 'Bearer abc']) {
    const r = modeOf({ NEUIQ_AUTH_MODE: bad }, 'seed');
    assert.ok(refused(r), bad);
    assert.ok(r.includes('NEUIQ_AUTH_MODE must be one of demo | zoho'), bad);
  }
  // A long value (say, a secret pasted into the wrong variable) is clipped in the message.
  const r = modeOf({ NEUIQ_AUTH_MODE: 'x'.repeat(40) + 'SECRET' }, 'seed');
  assert.equal(r.includes('SECRET'), false);
}, 'auth mode: an unrecognised value is refused at startup, and never echoed whole');
ok(() => {
  assert.throws(() => createApp({ authMode: 'bogus' }), /NEUIQ_AUTH_MODE must be one of/);
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try { assert.throws(() => createApp({ authMode: 'demo' }), /not allowed with NODE_ENV=production/); } finally {
    if (prev === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = prev;
  }
}, 'auth mode: createApp() enforces the same rules — no entry point can build a forbidden app');

/** Run `node server.js` with only the given variables. Every case here must REFUSE before listen. */
const boot = (vars) => {
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: '0', ...vars };
  const r = spawnSync(process.execPath, ['server.js'], {
    cwd: fileURLToPath(new URL('..', import.meta.url)), env, encoding: 'utf8', timeout: 20000,
  });
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` };
};
ok(() => {
  const fakeZoho = { ZOHO_CLIENT_ID: 'test-id', ZOHO_CLIENT_SECRET: 'test-secret', ZOHO_REFRESH_TOKEN: 'test-refresh' };
  const cases = [
    [{ NEUIQ_DATA_SOURCE: 'seed', NEUIQ_AUTH_MODE: 'sso' }, 'NEUIQ_AUTH_MODE must be one of'],
    [{ NEUIQ_DATA_SOURCE: 'zoho', NEUIQ_AUTH_MODE: 'demo', ...fakeZoho }, 'only allowed with NEUIQ_DATA_SOURCE=seed'],
    [{ NEUIQ_DATA_SOURCE: 'zoho', ...fakeZoho }, 'NEUIQ_AUTH_MODE is unset'],
    [{ NEUIQ_DATA_SOURCE: 'zoho', NEUIQ_AUTH_MODE: 'demo', NODE_ENV: 'production', ...fakeZoho }, 'only allowed with NEUIQ_DATA_SOURCE=seed'],
  ];
  for (const [vars, why] of cases) {
    const r = boot(vars);
    assert.equal(r.code, 1, `${JSON.stringify({ ...vars, ...Object.fromEntries(Object.keys(fakeZoho).map((k) => [k, '…'])) })} must exit 1`);
    assert.ok(r.out.includes('NeuIQ API refused to start') && r.out.includes(why), why);
    assert.equal(r.out.includes('NeuIQ API on http'), false, 'never listened');
    for (const secret of Object.values(fakeZoho)) assert.equal(r.out.includes(secret), false, 'no credential in the output');
  }
}, 'auth mode: node server.js refuses to start for invalid modes, demo over live data, and demo in production');

const runAuthHttp = async () => {
  const serve = async (authMode) => {
    const server = createApp(authMode === undefined ? {} : { authMode }).listen(0);
    await new Promise((r) => server.once('listening', r));
    return { server, base: `http://127.0.0.1:${server.address().port}/api/v1` };
  };
  const close = (server) => new Promise((r) => server.close(r));

  // Demo (the default over seed): unchanged.
  const demo = await serve();
  try {
    const health = await (await fetch(`${demo.base}/health`)).json();
    assert.equal(health.authMode, 'demo');
    assert.equal(health.employees, 50);
    assert.equal((await fetch(`${demo.base}/auth/users`)).status, 200);
    const login = await (await fetch(`${demo.base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'alex' }),
    })).json();
    assert.ok(login.token);
    assert.equal((await fetch(`${demo.base}/me`, { headers: { authorization: `Bearer ${login.token}` } })).status, 200);
    n++; console.log('ok   auth mode demo: /health says demo, the picker and demo login work exactly as before');
  } finally { await close(demo.server); }

  // Zoho mode over seed data: no demo routes, no headcount, no token accepted.
  const z = await serve('zoho');
  try {
    const health = await (await fetch(`${z.base}/health`)).json();
    assert.equal(health.authMode, 'zoho');
    assert.equal('employees' in health, false, 'no headcount on a public endpoint in zoho mode');
    assert.equal(health.dataSource, 'seed');
    n++; console.log('ok   auth mode zoho: /health says zoho and publishes no employee count');

    const users = await fetch(`${z.base}/auth/users`);
    const login = await fetch(`${z.base}/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'meera' }),
    });
    assert.equal(users.status, 404);
    assert.equal(login.status, 404);
    const body = await login.json();
    assert.equal('token' in body, false);
    assert.equal(JSON.stringify(await users.json()).includes('meera'), false, 'no account list');
    for (const method of ['GET', 'PUT', 'DELETE']) assert.equal((await fetch(`${z.base}/auth/login`, { method })).status, 404, method);
    n++; console.log('ok   auth mode zoho: /auth/users and /auth/login are 404 for every method — not 401, not a demo login');

    // A demo token minted with the same AUTH_SECRET must not open anything in zoho mode.
    const seedUser = buildSeed().employees.find((e) => e.username === 'meera');
    const demoToken = issueToken(seedUser);
    assert.ok(verifyToken(demoToken), 'the token is genuinely valid…');
    for (const path of ['/me', '/ai/capabilities', '/dashboards', '/analytics/summary']) {
      const r = await fetch(`${z.base}${path}`, { headers: { authorization: `Bearer ${demoToken}` } });
      assert.equal(r.status, 401, path);
    }
    const chat = await fetch(`${z.base}/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${demoToken}` },
      body: JSON.stringify({ message: 'how much leave do I have left?' }),
    });
    assert.equal(chat.status, 401);
    n++; console.log('ok   auth mode zoho: …but a valid demo token is refused everywhere — no demo authentication can occur');
  } finally { await close(z.server); }
};

await run();
await runChat();
await runHttp();
await runAuthHttp();
console.log(`\nall ${n} backend checks pass`);
