/**
 * The read-only query engine behind AI dashboards and analytics.
 *
 * The assistant gets broad READ access through a constrained JSON DSL: it can filter, group and
 * aggregate any whitelisted column of any whitelisted source, but it never emits SQL, ZCQL or a
 * field name of its own devising. **The DSL is a menu, not a parser** — every field that reaches
 * the data layer has to appear in the source registry first, so there is no injection surface and
 * no write path.
 *
 * Scoping is not optional and not the caller's job. A non-admin's query is rewritten with a
 * filter pinning it to their own rows BEFORE it runs, and a source that cannot be pinned that way
 * is refused outright. This is enforced here rather than in the route handler because the AI
 * builder calls the same function — putting it in the route would leave the builder path, which
 * is exactly the path an attacker would use, unguarded.
 *
 * Moved from dashboards/query.service.js. The logic is unchanged; the only difference is where
 * the two things it needs come from. Sources arrive from the registry rather than a literal in
 * this file, and rows arrive from `source.rows()` rather than an imported seed — so the engine no
 * longer knows that Zoho People exists.
 *
 * The client mirror is frontend/src/shared/dashboards/spec.js and the two must stay in step.
 * See docs/backend/15-dashboards.md.
 */
import { getSource } from './sources.js';
import { isAdmin } from '../policy/roles.js';
import { scopeFilters } from '../policy/scope.js';

export const METRICS = ['count', 'sum', 'avg', 'min', 'max'];
export const OPS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'];

/**
 * Whitelist a spec. Returns null when the source is unknown, which drops the widget entirely.
 *
 * Runs on BOTH directions of untrusted input: what the model emits, and what a client sends on
 * save. Neither is trusted, because `widgets` is a JSON blob that will otherwise store whatever
 * it is handed and hand it back to every future reader.
 */
export function sanitize(raw) {
  const q = raw || {};
  const src = getSource(q.source);
  if (!src) return null;

  const known = new Set([...src.group, ...src.numeric]);
  const out = { source: String(q.source) };

  if (typeof q.groupBy === 'string' && src.group.includes(q.groupBy)) out.groupBy = q.groupBy;
  if (METRICS.includes(q.metric)) out.metric = q.metric;
  if (typeof q.field === 'string' && src.numeric.includes(q.field)) out.field = q.field;
  if (q.sort === 'asc' || q.sort === 'desc') out.sort = q.sort;
  if (Number(q.limit)) out.limit = Math.min(50, Math.max(1, Math.floor(Number(q.limit))));

  // A sum with no field is a count in disguise. Say so rather than silently summing nothing.
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

/** Apply one DSL filter clause to a row. */
function matches(row, f) {
  const v = row[f.field];
  switch (f.op) {
    case 'ne': return v !== f.value;
    case 'gt': return Number(v) > Number(f.value);
    case 'gte': return Number(v) >= Number(f.value);
    case 'lt': return Number(v) < Number(f.value);
    case 'lte': return Number(v) <= Number(f.value);
    case 'contains': return String(v ?? '').toLowerCase().includes(String(f.value).toLowerCase());
    default: return v === f.value;
  }
}

const MONTH_LABEL = (key) => {
  const [y, m] = key.split('-').map(Number);
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
};

/**
 * Run a spec for a caller.
 *
 * Throws a `{ status, message }`-shaped error rather than returning empty when a caller asks for
 * something they may not see. An empty result would be indistinguishable from "no rows", and a
 * user told "no data" when the real answer is "not for you" will keep asking.
 */
export function runQuery(raw, user) {
  const spec = sanitize(raw);
  if (!spec) {
    const e = new Error('Unknown data source');
    e.status = 400;
    throw e;
  }

  const src = getSource(spec.source);

  // ---- SCOPING: rewrite before running, never after ----
  // scopeFilters throws 403 for an admin-only source, so this line is also the refusal.
  const filters = [...(spec.filter || []), ...scopeFilters(src, user)];

  let rows = src.rows().filter((row) => filters.every((f) => matches(row, f)));

  // No grouping: a single aggregate over the whole set.
  const metric = spec.metric || 'count';
  if (!spec.groupBy) {
    return {
      data: [{ name: src.label, value: aggregate(rows, metric, spec.field), count: rows.length }],
      meta: { source: spec.source, metric, field: spec.field, scoped: !isAdmin(user) },
    };
  }

  const buckets = new Map();
  for (const row of rows) {
    const key = String(row[spec.groupBy] ?? '—');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  let data = [...buckets.entries()].map(([key, group]) => ({
    // `month` sorts on the raw key but displays as a label — "2026-03" orders correctly,
    // "Mar 2026" does not.
    name: spec.groupBy === 'month' ? MONTH_LABEL(key) : key,
    sortKey: key,
    value: aggregate(group, metric, spec.field),
    count: group.length,
  }));

  // A month grouping is a time series: it must stay in calendar order whatever `sort` says,
  // because a trend line with its months shuffled is worse than no chart.
  if (spec.groupBy === 'month') data.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  else if (spec.sort === 'asc') data.sort((a, b) => a.value - b.value);
  else data.sort((a, b) => b.value - a.value);

  data = data.map(({ sortKey, ...rest }) => rest);
  if (spec.limit) data = data.slice(0, spec.limit);

  return {
    data,
    meta: { source: spec.source, groupBy: spec.groupBy, metric, field: spec.field, scoped: !isAdmin(user) },
  };
}

function aggregate(rows, metric, field) {
  if (metric === 'count' || !field) return rows.length;
  const nums = rows.map((r) => Number(r[field])).filter((n) => !Number.isNaN(n));
  if (!nums.length) return 0;
  const round = (n) => Math.round(n * 10) / 10;
  switch (metric) {
    case 'sum': return round(nums.reduce((a, b) => a + b, 0));
    case 'avg': return round(nums.reduce((a, b) => a + b, 0) / nums.length);
    case 'min': return round(Math.min(...nums));
    case 'max': return round(Math.max(...nums));
    default: return rows.length;
  }
}
