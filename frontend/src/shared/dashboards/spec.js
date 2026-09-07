/**
 * On-demand dashboards — the widget CONTRACT, and nothing else.
 *
 * Split out from dashboards.js so it imports nothing: no React, no API client, no build
 * aliases. That is what lets test/dashboards.check.mjs run it under plain `node`, and the
 * whitelist is the one part of this feature that most deserves a test which cannot be
 * skipped for want of a bundler.
 *
 * Modelled on the NexGen portal's dashboards module, which is the version of this idea that has
 * actually run against a real database. Three rules carry over, and they are the whole design:
 *
 *  1. A widget stores the QUESTION, never the answer. `{type, title, query}` is what persists;
 *     the value is resolved on every read.
 *  2. The model never touches data. It emits a spec, and every part of that spec is whitelisted
 *     by `sanitize()` before anything runs. The DSL is a menu, not a parser — there is no string
 *     a model can emit that becomes a query this file does not already know.
 *  3. Scoping happens at READ time, not build time. A dashboard saved by an HR admin and opened
 *     by an employee must return only that employee's rows. That is why the value cannot be
 *     stored: a stored number has already escaped whoever's permissions produced it.
 *
 * Everything below the CONTRACT line stands in for the Catalyst backend. Swapping it means
 * pointing build() at POST /api/v1/dashboards/build and runQuery() at POST /api/v1/query.
 * The spec shape does not change.
 */

// ===== CONTRACT — keep in step with docs/backend/15-dashboards.md =====

export const SPEC_VERSION = 1;

export const METRICS = ['count', 'sum', 'avg', 'min', 'max'];
export const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'];

/** Every type the client can draw, plus the two that are not charts. */
export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut'];
export const WIDGET_TYPES = ['kpi', 'table', ...CHART_TYPES];

/**
 * The queryable sources. A field that is not listed here cannot be grouped, filtered or summed,
 * no matter what a model emits.
 *
 * `scope` builds the filter that pins a source to one employee. A source whose scope is null has
 * no owner and is therefore admin-only — there is no way to show a slice of it safely.
 */
export const SOURCES = {
  leave: {
    label: 'Leave records',
    group: ['month', 'leaveType', 'status', 'departmentId'],
    numeric: ['days'],
    scope: (employeeId) => ({ field: 'employeeId', op: 'eq', value: employeeId }),
  },
  attendance: {
    label: 'Attendance',
    group: ['month', 'status', 'departmentId'],
    numeric: ['hours', 'lateMinutes'],
    scope: (employeeId) => ({ field: 'employeeId', op: 'eq', value: employeeId }),
  },
  employees: {
    label: 'Employees',
    group: ['department', 'location', 'designation', 'employmentType'],
    numeric: ['tenureMonths'],
    scope: null,
    adminOnly: true,
  },
};

/** The source list handed to the model — labels and field names only, never rows. */
export function schemaFor({ isAdmin } = {}) {
  return Object.entries(SOURCES)
    .filter(([, s]) => isAdmin || !s.adminOnly)
    .map(([key, s]) => ({ source: key, label: s.label, group: s.group, numeric: s.numeric }));
}

/**
 * Whitelist a query spec. Returns null when the source is unknown, which drops the widget.
 *
 * Runs on anything arriving from a model AND on anything arriving from a client save — neither
 * is trusted, because `widgets` is a JSON column that will otherwise store whatever it is handed
 * and hand it back to every future reader.
 */
export function sanitize(raw) {
  const q = raw || {};
  const src = SOURCES[String(q.source)];
  if (!src) return null;

  const known = new Set([...src.group, ...src.numeric]);
  const out = { source: String(q.source) };

  if (typeof q.groupBy === 'string' && src.group.includes(q.groupBy)) out.groupBy = q.groupBy;
  if (METRICS.includes(q.metric)) out.metric = q.metric;
  if (typeof q.field === 'string' && src.numeric.includes(q.field)) out.field = q.field;
  if (q.sort === 'asc' || q.sort === 'desc') out.sort = q.sort;
  if (Number(q.limit)) out.limit = Math.min(50, Math.max(1, Math.floor(Number(q.limit))));

  // A sum with no field is a count in disguise; say so rather than silently summing nothing.
  if (out.metric && out.metric !== 'count' && !out.field) out.metric = 'count';

  if (Array.isArray(q.filter)) {
    const filters = q.filter
      .filter((f) => f && typeof f === 'object')
      .filter((f) => typeof f.field === 'string' && known.has(f.field))
      .slice(0, 5)
      .map((f) => ({ field: String(f.field), op: OPS.includes(f.op) ? f.op : 'eq', value: f.value }));
    if (filters.length) out.filter = filters;
  }
  return out;
}

/** Drop anything this app cannot render, and re-whitelist every query. */
export function cleanWidgets(widgets) {
  return (Array.isArray(widgets) ? widgets : [])
    .slice(0, 12)
    .map((raw) => {
      const w = raw || {};
      // An unrenderable type falls through to a bar chart: a silent downgrade beats a blank card.
      const type = WIDGET_TYPES.includes(w.type) ? w.type : 'bar';
      const title = String(w.title || '').slice(0, 60);
      if (type === 'kpi') return { type, title: title || 'Headline numbers' };
      const query = sanitize(w.query);
      if (!query) return null;
      // A chart with no grouping is a single bar whose title promises a breakdown it cannot
      // show. Kept in step with cleanWidgets in the backend's dashboards/spec.js, where the
      // reasoning is written out.
      if (!query.groupBy) return null;
      return { type, title: title || 'Chart', query };
    })
    .filter(Boolean);
}

// ===== the offline stand-ins =====
//
// Sample rows and the keyword builder. They live beside the contract, not beside the network
// layer, because they are pure functions over the same whitelist — and because the whitelist
// test needs to reach them without a bundler.

export const SUGGESTIONS = [
  'Leave taken by type this year, and the headline numbers',
  'Attendance by month as a line',
  'Headcount by department',
  'Leave by status as a donut, with days by month',
];

/** Sample rows, keyed the way a query identifies itself: source + groupBy. */
const SAMPLE_ROWS = {
  'leave:leaveType': [
    { name: 'Casual', value: 214 }, { name: 'Sick', value: 133 },
    { name: 'Earned', value: 96 }, { name: 'Unpaid', value: 18 },
  ],
  'leave:status': [
    { name: 'Approved', value: 372 }, { name: 'Pending', value: 54 }, { name: 'Rejected', value: 35 },
  ],
  'leave:month': [
    { name: 'Apr 2026', value: 38 }, { name: 'May 2026', value: 44 }, { name: 'Jun 2026', value: 61 },
    { name: 'Jul 2026', value: 52 }, { name: 'Aug 2026', value: 71 }, { name: 'Sep 2026', value: 29 },
  ],
  'attendance:month': [
    { name: 'Apr 2026', value: 8.1 }, { name: 'May 2026', value: 8.4 }, { name: 'Jun 2026', value: 8.2 },
    { name: 'Jul 2026', value: 8.6 }, { name: 'Aug 2026', value: 8.3 }, { name: 'Sep 2026', value: 8.5 },
  ],
  'attendance:status': [
    { name: 'Present', value: 1840 }, { name: 'Remote', value: 412 },
    { name: 'On leave', value: 233 }, { name: 'Absent', value: 41 },
  ],
  'employees:department': [
    { name: 'Engineering', value: 42 }, { name: 'Sales', value: 27 }, { name: 'Support', value: 19 },
    { name: 'Finance', value: 11 }, { name: 'People', value: 6 },
  ],
  'employees:location': [
    { name: 'Pune', value: 58 }, { name: 'Bengaluru', value: 31 }, { name: 'Remote', value: 16 },
  ],
};

export const SAMPLE_KPIS = [
  { name: 'Headcount', value: '105' },
  { name: 'On leave today', value: '7' },
  { name: 'Avg hours / day', value: '8.4' },
  { name: 'Pending approvals', value: '12' },
];

/** What POST /query would have returned, from the table above. */
export function sampleQuery(spec) {
  const clean = sanitize(spec);
  if (!clean) return { data: [], meta: null };
  const rows = SAMPLE_ROWS[`${clean.source}:${clean.groupBy}`] || [];
  const sorted = clean.sort === 'asc' ? [...rows].sort((a, b) => a.value - b.value) : rows;
  return {
    data: clean.limit ? sorted.slice(0, clean.limit) : sorted,
    meta: { source: clean.source, groupBy: clean.groupBy, metric: clean.metric || 'count', field: clean.field },
  };
}

/**
 * Keyword builder — the offline twin of POST /dashboards/build.
 *
 * Its type choices deliberately match the rules the backend's own fallback and model prompt
 * follow: a status mix is a donut, anything by month is a line, a ranking is a bar. If the two
 * disagreed, going offline would change the shape of the dashboard you asked for.
 */
export function sampleBuild(prompt) {
  const p = prompt.toLowerCase();
  const has = (...w) => w.some((x) => p.includes(x));
  const widgets = [{ type: 'kpi', title: 'Headline numbers' }];

  if (has('leave', 'holiday', 'time off', 'absence')) {
    widgets.push({ type: 'bar', title: 'Leave days by type', query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' } });
  }
  if (has('status', 'approval', 'pending', 'donut', 'pie')) {
    widgets.push({ type: 'donut', title: 'Leave by status', query: { source: 'leave', groupBy: 'status', metric: 'count' } });
  }
  if (has('month', 'trend', 'over time', 'attendance', 'hours', 'line')) {
    widgets.push({ type: 'line', title: 'Average hours by month', query: { source: 'attendance', groupBy: 'month', metric: 'avg', field: 'hours' } });
  }
  if (has('headcount', 'department', 'team size', 'employee')) {
    widgets.push({ type: 'bar', title: 'Headcount by department', query: { source: 'employees', groupBy: 'department', metric: 'count', sort: 'desc' } });
  }
  if (widgets.length === 1) {
    widgets.push({ type: 'bar', title: 'Leave days by type', query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' } });
  }

  return { title: prompt.slice(0, 48), widgets: cleanWidgets(widgets), source: 'sample' };
}
