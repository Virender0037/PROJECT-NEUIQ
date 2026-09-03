import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { GRID_PROJECTS } from '../data/mockData.js';

const TABS = [['your', 'Your projects'], ['org', 'Organization'], ['shared', 'Shared with you']];

/** Screen 10 — projects grid: header actions, 3 tabs, 2-column locked cards. */
export default function ProjectsGrid() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'Geist', fontSize: 28, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Projects</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SquareBtn icon="search" onClick={app.openSearch} />
          <SquareBtn icon="help" onClick={app.toast} />
          <El as="button" onClick={app.toast}
            css="display:flex;align-items:center;gap:7px;height:36px;padding:0 12px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text);border-radius:9px;cursor:pointer;font-size:13px;font-family:'Inter Tight'"
            hover="background:var(--hover)"><span style={{ color: 'var(--text-subtle)' }}>Sort by</span> <span style={{ fontWeight: 600 }}>Last updated</span><Icon name="chevron" size={16} /></El>
          <El as="button" onClick={app.toast}
            css="display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:var(--border-w) solid var(--accent);background:var(--accent);color:var(--accent-fg);border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;font-family:'Inter Tight';box-shadow:var(--sh-sm)"
            hover="filter:brightness(1.06)">New project</El>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: 'var(--border-w) solid var(--border)', marginBottom: 22 }}>
        {TABS.map(([id, label]) => {
          const on = app.pgTab === id;
          return (
            <button key={id} onClick={() => app.setPgTab(id)} style={{ border: 'none', background: 'transparent', padding: '10px 4px', marginRight: 14, cursor: 'pointer', fontFamily: "'Inter Tight'", fontSize: 14, fontWeight: on ? 600 : 500, color: on ? 'var(--text)' : 'var(--text-subtle)', borderBottom: `2px solid ${on ? 'var(--text)' : 'transparent'}`, marginBottom: -1 }}>{label}</button>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {GRID_PROJECTS.map((p) => (
          <El key={p.name} as="button" onClick={() => app.go('project')}
            css="text-align:left;border:var(--border-w) solid var(--border);background:var(--surface);border-radius:14px;padding:18px 20px;cursor:pointer;min-height:96px;transition:background .12s,border-color .12s,transform .08s"
            hover="background:var(--hover);border-color:var(--border-strong)" active="transform:translateY(.5px)">
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: 'Geist', fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
              <span style={{ color: 'var(--text-subtle)', display: 'flex' }}><Icon name="lock" size={14} /></span>
            </span>
            {p.desc && <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>{p.desc}</span>}
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-subtle)' }}>{p.date}</span>
          </El>
        ))}
      </div>
    </div>
  );
}

function SquareBtn({ icon, onClick }) {
  return (
    <El as="button" onClick={onClick}
      css="width:36px;height:36px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center"
      hover="background:var(--hover);color:var(--text)"><Icon name={icon} size={18} /></El>
  );
}
