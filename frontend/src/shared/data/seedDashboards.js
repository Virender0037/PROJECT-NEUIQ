/**
 * Seed dashboards and reports.
 *
 * Every tab in the app opens with something in it. An empty state is honest but it is a bad
 * demo and a worse review surface: you cannot tell whether a chart renders correctly, whether
 * the stagger animation looks right, or whether a long title wraps, until something is on screen.
 *
 * These are widget SPECS, not rendered values — the same shape the AI builder emits and the same
 * shape the server will store. They go through `cleanWidgets()` before use, so if the contract
 * ever changes underneath them, they fail the same way real data would rather than silently
 * bypassing validation.
 *
 * `seeded: true` is on every row so real data can be told apart from demo data in one filter
 * once there is a backend.
 */

/** Three saved dashboards, chosen to exercise every widget type between them. */
export const SEED_DASHBOARDS = [
  {
    id: 'seed-leave',
    title: 'Leave overview',
    seeded: true,
    updatedAt: '2026-09-02T09:20:00.000Z',
    widgets: [
      { type: 'kpi', title: 'Headline numbers' },
      { type: 'bar', title: 'Leave days by type', query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' } },
      { type: 'donut', title: 'Applications by status', query: { source: 'leave', groupBy: 'status', metric: 'count' } },
      { type: 'area', title: 'Leave days by month', query: { source: 'leave', groupBy: 'month', metric: 'sum', field: 'days' } },
    ],
  },
  {
    id: 'seed-attendance',
    title: 'Attendance',
    seeded: true,
    updatedAt: '2026-08-28T16:05:00.000Z',
    widgets: [
      { type: 'line', title: 'Average hours by month', query: { source: 'attendance', groupBy: 'month', metric: 'avg', field: 'hours' } },
      { type: 'pie', title: 'Attendance mix', query: { source: 'attendance', groupBy: 'status', metric: 'count' } },
      { type: 'table', title: 'Late minutes by month', query: { source: 'attendance', groupBy: 'month', metric: 'sum', field: 'lateMinutes' } },
    ],
  },
  {
    id: 'seed-people',
    title: 'People (admin)',
    seeded: true,
    updatedAt: '2026-08-19T11:41:00.000Z',
    widgets: [
      { type: 'bar', title: 'Headcount by department', query: { source: 'employees', groupBy: 'department', metric: 'count', sort: 'desc' } },
      { type: 'donut', title: 'Headcount by location', query: { source: 'employees', groupBy: 'location', metric: 'count' } },
    ],
  },
];

/**
 * Reports that already exist under "Built by you", so the Reports tab is not an empty shelf.
 * `origin` is the interesting column: it records whether a human or the model assembled it,
 * which is the thing people actually want to know when they find a report they did not make.
 */
export const SEED_SAVED_REPORTS = [
  { title: 'Leave liability by department', origin: 'AI', when: '2 days ago', icon: 'sparkles', view: 'custom' },
  { title: 'Monthly attendance trend', origin: 'Chart Builder', when: '5 days ago', icon: 'sliders', view: 'builder' },
  { title: 'Casual leave by month', origin: 'AI', when: '2 weeks ago', icon: 'sparkles', view: 'custom' },
];

/** Recent AI activity, shown on the AI tab so it opens with history rather than a blank panel. */
export const SEED_AI_ACTIVITY = [
  { text: 'Built "Leave overview" from a description', tool: 'dashboards.build', time: '2 days ago', icon: 'sparkles' },
  { text: 'Answered "who is on leave today"', tool: 'zohoPeople.teamOnLeave', time: '2 days ago', icon: 'user' },
  { text: 'Answered "my casual leave balance"', tool: 'zohoPeople.leaveBalance', time: '3 days ago', icon: 'checkCircle' },
  { text: 'Declined "give everyone a raise" — no write tools', tool: '—', time: '4 days ago', icon: 'lock' },
];
