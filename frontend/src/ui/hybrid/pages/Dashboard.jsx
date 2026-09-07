import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { STATS, USAGE_DAYS, USAGE_VALUES, ACTIVITY, RECENT_WORK } from '@shared/data/mockData.js';

/**
 * Dashboard — workspace activity at a glance.
 *
 * Distinct from Analytics: this is telemetry about USING NeuIQ (chats, messages, streaks),
 * whereas Analytics is about the Zoho People data itself. Keeping them apart matters because
 * they will come from different backends — this one needs an event pipeline that does not
 * exist yet, which is why every figure here is still mock.
 *
 * The weekly bars are plain divs, not a chart library: seven values with one highlighted does
 * not justify a dependency, and CSS variables theme them for free.
 */
export default function Dashboard() {
  const app = useApp();
  const open = (r) => (r.open === 'project' ? () => app.go('project') : app.loadConvo);

  return (
    <div className="view">
      <div className="page-head">
        <h1>Overview</h1>
        <p>Activity across your workspace.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 16, marginBottom: 22 }}>
        {STATS.map(st => (
          <div className="card" key={st.label}>
            <div className="k-label"><span className="k-icon"><Icon name={st.icon} size={16} /></span>{st.label}</div>
            <div className="k-value">{st.value}</div>
            <div className="k-sub">{st.delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 22 }}>
        <div className="dw-card">
          <div className="dw-head" style={{ marginBottom: 4 }}>Weekly usage</div>
          <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginBottom: 20 }}>Messages sent per day</div>
          <div className="neuiq-bars">
            {USAGE_DAYS.map((day, i) => (
              <div key={day}>
                <div className={'neuiq-bar' + (i === 4 ? ' on' : '')} style={{ height: USAGE_VALUES[i] + '%' }} />
                <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>{day}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="dw-card">
          <div className="dw-head" style={{ marginBottom: 16 }}>Recent activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span className="k-icon" style={{ width: 28, height: 28 }}><Icon name={a.icon} size={15} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, lineHeight: 1.4 }}>{a.text}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-dim)' }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="neuiq-group-label">Recent work</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16 }}>
        {RECENT_WORK.map(w => (
          <button className="card clickable" key={w.title} onClick={open(w)} style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}>
            <span className="k-icon" style={{ marginBottom: 12 }}><Icon name={w.icon} size={16} /></span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 650 }}>{w.title}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginTop: 3 }}>{w.meta}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
