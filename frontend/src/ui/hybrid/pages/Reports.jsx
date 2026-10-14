import { useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import AnalyticsTabs from '../components/AnalyticsTabs.jsx';
import Widget from '../components/Widget.jsx';
import { useDashboards } from '@shared/dashboards/useDashboards.js';
import { errorState } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * Reports — the shelf, and a report opens on it.
 *
 * The standard reports are just widget specs with names. That is deliberate: a "report" and a
 * "dashboard" are the same object in this system, so there is one query engine, one whitelist
 * and one scoping rule behind both. Giving reports their own pipeline would mean a second place
 * for row-level permissions to be enforced, and a second place for that to be got wrong.
 *
 * Clicking one resolves its widgets against the API, scoped to whoever is signed in — an
 * employee opening "Leave register" sees their own records, an HR admin sees the organisation's,
 * from the identical spec.
 */
const STANDARD = [
  {
    title: 'Leave register',
    sub: 'Every leave record, by type and status',
    icon: 'file',
    widgets: [
      { type: 'kpi', title: 'Headline numbers' },
      { type: 'bar', title: 'Leave days by type', query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' } },
      { type: 'donut', title: 'Applications by status', query: { source: 'leave', groupBy: 'status', metric: 'count' } },
      { type: 'table', title: 'Leave days by month', query: { source: 'leave', groupBy: 'month', metric: 'sum', field: 'days' } },
    ],
  },
  {
    title: 'Attendance summary',
    sub: 'Hours, late marks and absences by month',
    icon: 'clock',
    widgets: [
      { type: 'line', title: 'Average hours by month', query: { source: 'attendance', groupBy: 'month', metric: 'avg', field: 'hours' } },
      { type: 'pie', title: 'Attendance mix', query: { source: 'attendance', groupBy: 'status', metric: 'count' } },
      { type: 'table', title: 'Late minutes by month', query: { source: 'attendance', groupBy: 'month', metric: 'sum', field: 'lateMinutes' } },
    ],
  },
  {
    // Admin-only underneath: `employees` has no owner field, so there is no safe slice of it.
    // A non-admin opening this gets "Not available on your account" in the tile, which is the
    // honest answer — see the note on Failed in components/Widget.jsx.
    title: 'Headcount',
    sub: 'Employees by department, location and type',
    icon: 'user',
    widgets: [
      { type: 'bar', title: 'Headcount by department', query: { source: 'employees', groupBy: 'department', metric: 'count', sort: 'desc' } },
      { type: 'donut', title: 'By location', query: { source: 'employees', groupBy: 'location', metric: 'count' } },
      { type: 'table', title: 'By employment type', query: { source: 'employees', groupBy: 'employmentType', metric: 'count' } },
    ],
  },
  {
    title: 'Leave liability',
    sub: 'Days taken against each leave type',
    icon: 'activity',
    widgets: [
      { type: 'bar', title: 'Days by type', query: { source: 'leave', groupBy: 'leaveType', metric: 'sum', field: 'days', sort: 'desc' } },
      { type: 'area', title: 'Days by month', query: { source: 'leave', groupBy: 'month', metric: 'sum', field: 'days' } },
    ],
  },
  {
    title: 'Approval turnaround',
    sub: 'Where requests are sitting right now',
    icon: 'checkCircle',
    widgets: [
      { type: 'donut', title: 'By status', query: { source: 'leave', groupBy: 'status', metric: 'count' } },
      { type: 'table', title: 'Applications by month', query: { source: 'leave', groupBy: 'month', metric: 'count' } },
    ],
  },
  {
    title: 'Tenure',
    sub: 'How long people have been here, by department',
    icon: 'refresh',
    widgets: [
      { type: 'bar', title: 'Average tenure (months)', query: { source: 'employees', groupBy: 'department', metric: 'avg', field: 'tenureMonths', sort: 'desc' } },
    ],
  },
];

export default function Reports() {
  const app = useApp();
  const dash = useDashboards();
  /** Which standard report is open. Null is the shelf — the index is the default view. */
  const [openReport, setOpenReport] = useState(null);
  const report = STANDARD.find((r) => r.title === openReport) || null;

  return (
    <AnalyticsTabs
      active="reports"
      actions={
        report
          ? <button className="btn ghost" onClick={() => setOpenReport(null)}><Icon name="chevron" size={15} style={{ transform: 'rotate(90deg)' }} />All reports</button>
          : <button className="btn ghost" onClick={app.toast}><Icon name="download" size={15} />Export</button>
      }
    >
      {report ? (
        <>
          <div className="neuiq-group-label">{report.title}</div>
          <p style={{ fontSize: 13, color: 'var(--ink-dim)', margin: '0 0 14px', lineHeight: 1.5 }}>
            {report.sub} — resolved against your own permissions each time it is opened.
          </p>
          <div className="dw-grid">
            {report.widgets.map((w, i) => <Widget key={i} widget={w} />)}
          </div>
        </>
      ) : (
        <>
          <div className="neuiq-group-label">Standard reports</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>
            {STANDARD.map((r) => (
              <button
                key={r.title}
                className="card clickable"
                onClick={() => setOpenReport(r.title)}
                style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
              >
                <span className="k-icon" style={{ marginBottom: 12 }}><Icon name={r.icon} size={16} /></span>
                <span style={{ display: 'block', fontSize: 14.5, fontWeight: 650 }}>{r.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 3, lineHeight: 1.45 }}>{r.sub}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 9 }}>
                  {r.widgets.length} widget{r.widgets.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>

          <div className="neuiq-group-label">
            Built by you
          </div>
          {dash.loading ? (
            <div className="neuiq-list"><div className="neuiq-row"><span className="dw-skel" style={{ height: 16, flex: 1 }} /></div></div>
          ) : dash.error ? (
            // Unreachable or refused: never "Nothing saved yet", which would claim there is nothing.
            <EmptyPanel state={errorState(dash.error)} />
          ) : dash.list.length ? (
            <div className="neuiq-list">
              {dash.list.map((d) => (
                // Everything you have saved, from either route — the AI builder and the chart
                // builder write to the same place, so this is one list rather than two.
                <button className="neuiq-row" key={d.id} onClick={() => app.go('custom')}>
                  <Icon name="layoutGrid" size={16} />
                  <span style={{ flex: 1, minWidth: 0 }}>{d.title}</span>
                  <span className="chip">{d.widgets.length} widget{d.widgets.length === 1 ? '' : 's'}</span>
                  <span style={{ fontSize: 12, color: 'var(--ink-dim)', width: 78, textAlign: 'right' }}>
                    {d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : '—'}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dw-empty" style={{ padding: 22 }}>
              Nothing saved yet — build one below and it appears here.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <button className="btn ghost" onClick={() => app.go('builder')}><Icon name="sliders" size={15} />Build by hand</button>
            <button className="btn primary" onClick={() => app.go('custom')}><Icon name="sparkles" size={15} />Build with AI</button>
          </div>
        </>
      )}
    </AnalyticsTabs>
  );
}
