/**
 * One runnable check for the widget contract — the whitelist is the security boundary, so if
 * it stops rejecting, that must fail loudly rather than quietly widen what a model can query.
 *
 *   node test/dashboards.check.mjs
 *
 * No framework on purpose: assertions over the real module, exit 1 on any failure.
 */
import assert from 'node:assert/strict';
import {
  sanitize, cleanWidgets, sampleQuery as runQuery, sampleBuild as build, schemaFor, SOURCES, WIDGET_TYPES,
} from '../src/shared/dashboards/spec.js';

let n = 0;
const ok = (fn, what) => { fn(); n++; console.log('ok  ', what); };

// ---- sanitize: the DSL is a menu, not a parser ----
ok(() => assert.equal(sanitize({ source: 'nope' }), null), 'unknown source -> null');
ok(() => assert.equal(sanitize({ source: 'leave', groupBy: 'salary' }).groupBy, undefined), 'ungrouped field dropped');
ok(() => assert.equal(sanitize({ source: 'leave', field: 'secret' }).field, undefined), 'unknown measure dropped');
ok(() => assert.equal(sanitize({ source: 'leave', limit: 9999 }).limit, 50), 'limit clamped to 50');
ok(() => assert.equal(sanitize({ source: 'leave', limit: -3 }).limit, 1), 'limit floored at 1');
ok(() => assert.equal(sanitize({ source: 'leave', metric: 'sum' }).metric, 'count'), 'sum with no field -> count');
ok(() => assert.equal(sanitize({ source: 'leave', metric: 'DROP TABLE' }).metric, undefined), 'unknown metric dropped');
ok(() => assert.equal(sanitize({ source: 'leave', filter: [{ field: 'nope', op: 'eq', value: 1 }] }).filter, undefined), 'unknown filter field dropped');
ok(() => assert.equal(sanitize({ source: 'leave', filter: [{ field: 'days', op: 'DROP', value: 1 }] }).filter[0].op, 'eq'), 'bad op coerced to eq');
ok(() => assert.equal(sanitize({ source: 'leave', filter: Array(20).fill({ field: 'days', op: 'eq', value: 1 }) }).filter.length, 5), 'filters capped at 5');

// Nothing may reach a query that is not in the registry for that source.
ok(() => {
  for (const [key, def] of Object.entries(SOURCES)) {
    const clean = sanitize({ source: key, groupBy: def.group[0], field: def.numeric[0], metric: 'sum' });
    assert.ok(def.group.includes(clean.groupBy), `${key}: groupBy survived`);
    if (clean.field) assert.ok(def.numeric.includes(clean.field), `${key}: field survived`);
  }
}, 'every source round-trips only its own registered fields');

// ---- cleanWidgets ----
ok(() => assert.equal(cleanWidgets([{ type: 'sankey', title: 't', query: { source: 'leave', groupBy: 'status' } }])[0].type, 'bar'), 'undrawable type -> bar');
ok(() => assert.equal(cleanWidgets([{ type: 'bar', query: { source: 'nope' } }]).length, 0), 'widget with dead query dropped');
ok(() => assert.equal(cleanWidgets([{ type: 'kpi' }])[0].title, 'Headline numbers'), 'kpi needs no query');
ok(() => assert.equal(cleanWidgets(Array(40).fill({ type: 'kpi' })).length, 12), 'widget array capped at 12');
ok(() => assert.equal(cleanWidgets('not an array').length, 0), 'non-array input is empty, not a throw');
ok(() => {
  // `salary` is not a groupable field on `leave`. sanitize() keeps the rest of the query, which
  // is right for a READ - the analytics summary deliberately asks for a grand total with no
  // grouping - but wrong for a stored chart: what survives is a single bar under a title
  // promising a breakdown. It must be dropped instead.
  assert.equal(cleanWidgets([{ type: 'bar', title: 'By salary', query: { source: 'leave', groupBy: 'salary' } }]).length, 0);
  // A kpi tile carries no query, so the rule must not touch it.
  assert.equal(cleanWidgets([{ type: 'kpi' }]).length, 1);
}, 'a chart whose grouping was stripped is dropped, not left as one bar');

ok(() => cleanWidgets([{ type: 'kpi' }]).forEach((w) => assert.ok(WIDGET_TYPES.includes(w.type))), 'every surviving type is renderable');

// ---- scoping ----
ok(() => assert.ok(schemaFor({ isAdmin: false }).every((s) => s.source !== 'employees')), 'admin-only source hidden from non-admin');
ok(() => assert.ok(schemaFor({ isAdmin: true }).some((s) => s.source === 'employees')), 'admin sees the admin-only source');
ok(() => assert.ok(schemaFor({ isAdmin: true }).every((s) => !('scope' in s))), 'schema leaks no scope internals to the model');

// ---- resolve + build ----
ok(() => assert.ok(runQuery({ source: 'leave', groupBy: 'leaveType' }).data.length > 0), 'runQuery returns rows');
ok(() => assert.equal(runQuery({ source: 'nope' }).data.length, 0), 'dead query resolves empty, not throws');
ok(() => assert.equal(runQuery({ source: 'leave', groupBy: 'leaveType', limit: 2 }).data.length, 2), 'limit applied on resolve');
ok(() => assert.ok(build('leave by status and attendance by month').widgets.length >= 3), 'builder produces a multi-widget spec');
ok(() => assert.ok(build('xyzzy').widgets.length >= 2), 'builder always returns something');
ok(() => build('everything').widgets.forEach((w) => { if (w.type !== 'kpi') assert.ok(sanitize(w.query), 'built query survives sanitise'); }), 'builder output is already clean');

console.log(`\nall ${n} contract checks pass`);
