import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { STATS, USAGE_DAYS, USAGE_VALUES, ACTIVITY, RECENT_WORK } from '../data/mockData.js';

/** Screen 4 — stat cards, weekly-usage chart, recent activity, recent work. */
export default function Dashboard() {
  const app = useApp();
  const openRecent = (r) => (r.open === 'project' ? () => app.go('project') : app.loadConvo);

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14, marginBottom: 22 }}>
        {STATS.map((st) => (
          <div key={st.label} style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 18, boxShadow: 'var(--sh-xs)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-subtle)' }}>{st.label}</span>
              <span style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={st.icon} size={16} /></span>
            </div>
            <div style={{ fontFamily: 'Geist', fontSize: 28, fontWeight: 600, letterSpacing: '-.02em', color: 'var(--text)' }}>{st.value}</div>
            <div style={{ fontSize: 12, color: st.deltaColor, marginTop: 4, fontWeight: 500 }}>{st.delta}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14, marginBottom: 22 }}>
        <div style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Weekly usage</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-subtle)', marginBottom: 20 }}>Messages sent per day</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, height: 150 }}>
            {USAGE_DAYS.map((day, i) => (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ width: '100%', maxWidth: 34, borderRadius: '7px 7px 0 0', background: i === 4 ? 'var(--accent)' : 'var(--surface-2)', height: USAGE_VALUES[i] + '%', transition: 'height .4s ease-out' }} />
                <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{day}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Recent activity</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {ACTIVITY.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name={a.icon} size={16} /></span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.4 }}>{a.text}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-subtle)' }}>{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Recent work</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {RECENT_WORK.map((w) => (
          <El key={w.title} as="button" onClick={openRecent(w)}
            css="text-align:left;border:var(--border-w) solid var(--border);background:var(--surface);border-radius:13px;padding:16px;cursor:pointer;transition:background .12s,border-color .12s"
            hover="background:var(--hover);border-color:var(--border-strong)">
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}><Icon name={w.icon} size={16} /></span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{w.title}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-subtle)' }}>{w.meta}</span>
          </El>
        ))}
      </div>
    </div>
  );
}
