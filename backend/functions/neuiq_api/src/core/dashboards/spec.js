/**
 * The widget spec: what a dashboard actually stores.
 *
 * A widget persists the QUESTION, never the answer:
 *
 *     { type, title, query: { source, groupBy, metric, field, filter, sort, limit } }
 *
 * Not a value. Because a stored number has already escaped whoever's permissions produced it —
 * a dashboard built by an HR admin and later opened by an employee must return the employee's
 * rows, which is only possible if the query runs again, scoped to whoever is asking now.
 *
 * `cleanWidgets` is the gate. It runs on model output AND on every client save, because neither
 * is trusted and `widgets` is a JSON column that will hand back whatever it was given.
 */
import { sanitize } from '../query/engine.js';

export const SPEC_VERSION = 1;

/** Every type the client can draw, plus the two that are not charts. */
export const CHART_TYPES = ['bar', 'line', 'area', 'pie', 'donut'];
export const WIDGET_TYPES = ['kpi', 'table', ...CHART_TYPES];

/** How many widgets one dashboard may hold. A wall of forty charts is not a dashboard. */
const MAX_WIDGETS = 12;

export function cleanWidgets(widgets) {
  return (Array.isArray(widgets) ? widgets : [])
    .slice(0, MAX_WIDGETS)
    .map((raw) => {
      const w = raw || {};
      // An unrenderable type falls through to a bar chart rather than being dropped: a silent
      // downgrade still answers the question, a missing card looks like a bug.
      const type = WIDGET_TYPES.includes(w.type) ? w.type : 'bar';
      const title = String(w.title || '').slice(0, 60);

      // A kpi tile reads the headline numbers and carries no query.
      if (type === 'kpi') return { type, title: title || 'Headline numbers' };

      const query = sanitize(w.query);
      if (!query) return null;   // a query that cannot be whitelisted takes its widget with it

      /**
       * A chart needs something to plot against.
       *
       * `sanitize` drops an unknown `groupBy` field but keeps the rest of the query, which for a
       * READ is right — the analytics summary deliberately asks for a grand total with no
       * grouping. For a stored chart it is not: what survives is a single-bar tile whose title
       * promises a breakdown it cannot show. Drop it, so a bad grouping is a missing widget
       * (visible, fixable) rather than a chart that quietly means nothing.
       */
      if (!query.groupBy) return null;

      return { type, title: title || 'Chart', query };
    })
    .filter(Boolean);
}

/** Trim a dashboard title. An empty one is a no-op upstream, never a dashboard called "". */
export const cleanTitle = (t, fallback = 'Dashboard') => String(t || '').trim().slice(0, 80) || fallback;
