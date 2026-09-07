/**
 * The keyword dashboard builder — what runs when Gemini is unconfigured or unreachable.
 *
 * Deliberately dumb: it looks for the nouns this product actually has and assembles the obvious
 * chart for each. Better a plain dashboard than an error where a dashboard was asked for.
 *
 * Two things it still gets right, because they are correctness rather than cleverness:
 *
 *  - **Types are chosen the way the model prompt asks the model to choose them.** A status mix is
 *    a donut, anything by month is a line or area, a ranking is a bar. If the fallback contradicted
 *    the prompt's own rules, switching between them would change the answer's shape.
 *  - **It respects scope.** An employee asking for headcount gets a leave chart instead of an
 *    admin-only widget that would 403 on resolve. Offering a tile that cannot load is worse than
 *    not offering it.
 */
import { schemaFor } from './query.service.js';
import { cleanWidgets } from './spec.js';

const W = {
  kpi: { type: 'kpi', title: 'Headline numbers' },

  leaveByType: {
    type: 'bar',
    title: 'Leave days by type',
    query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' },
  },
  leaveByStatus: {
    type: 'donut',
    title: 'Applications by status',
    query: { source: 'leave', groupBy: 'status', metric: 'count' },
  },
  leaveByMonth: {
    type: 'area',
    title: 'Leave days by month',
    query: { source: 'leave', groupBy: 'month', metric: 'sum', field: 'days' },
  },
  hoursByMonth: {
    type: 'line',
    title: 'Average hours by month',
    query: { source: 'attendance', groupBy: 'month', metric: 'avg', field: 'hours' },
  },
  attendanceMix: {
    type: 'pie',
    title: 'Attendance mix',
    query: { source: 'attendance', groupBy: 'status', metric: 'count' },
  },
  lateByMonth: {
    type: 'table',
    title: 'Late minutes by month',
    query: { source: 'attendance', groupBy: 'month', metric: 'sum', field: 'lateMinutes' },
  },
  headcountByDept: {
    type: 'bar',
    title: 'Headcount by department',
    query: { source: 'employees', groupBy: 'department', metric: 'count', sort: 'desc' },
  },
  headcountByLocation: {
    type: 'donut',
    title: 'Headcount by location',
    query: { source: 'employees', groupBy: 'location', metric: 'count' },
  },
};

/** 2 to 5 widgets, same cap the model is held to. */
const MAX = 5;

export function keywordSpec(prompt, user) {
  const p = prompt.toLowerCase();
  const has = (...words) => words.some((w) => p.includes(w));

  // Which sources this caller may actually read. `employees` is admin-only.
  const allowed = new Set(schemaFor(user).map((s) => s.source));
  const canRead = (w) => !w.query || allowed.has(w.query.source);

  const picked = [W.kpi];
  const add = (w) => { if (canRead(w) && picked.length < MAX && !picked.includes(w)) picked.push(w); };

  const everything = has('everything', 'all of it', 'overview', 'summary');

  if (everything || has('leave', 'holiday', 'time off', 'absence')) add(W.leaveByType);
  if (everything || has('status', 'approval', 'pending', 'rejected')) add(W.leaveByStatus);
  if (everything || has('attendance', 'hours', 'clock', 'present')) add(W.hoursByMonth);
  if (has('late', 'punctual')) add(W.lateByMonth);
  if (has('mix', 'remote', 'breakdown')) add(W.attendanceMix);
  if (everything || has('headcount', 'department', 'team size', 'employee', 'people')) add(W.headcountByDept);
  if (has('location', 'office', 'site', 'city')) add(W.headcountByLocation);
  // A trend was asked for but nothing time-based got picked.
  if (has('trend', 'over time', 'month', 'growth') && !picked.includes(W.hoursByMonth)) add(W.leaveByMonth);

  // Nothing matched: give the two charts every account can read rather than a bare kpi tile.
  if (picked.length === 1) { add(W.leaveByType); add(W.hoursByMonth); }

  return {
    title: prompt.slice(0, 48),
    // Through the same gate as everything else, so the fallback cannot emit a spec the
    // whitelist would have rejected.
    widgets: cleanWidgets(picked),
  };
}
