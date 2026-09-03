import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { PROJECT_CHATS, PROJECT_FILES } from '../data/mockData.js';

const TABS = [['chats', 'Chats'], ['files', 'Files'], ['context', 'Context']];

/** Screen 6 — project header (icon, name, description, meta chips) + tabs. */
export default function ProjectWorkspace() {
  const app = useApp();
  const tab = app.projTab;

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
        <div style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="folder" size={24} /></div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'Geist', fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 4px' }}>AI Startup Assistant</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5, maxWidth: 620 }}>Working context for the go-to-market plan — positioning, competitor teardown, pricing experiments and the launch roadmap.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Chip icon="message" label="12 chats" />
            <Chip icon="file" label="24 documents" />
            <Chip icon="clock" label="Updated today" />
          </div>
        </div>
        <El as="button" onClick={app.toast}
          css="width:36px;height:36px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center"
          hover="background:var(--hover);color:var(--text)"><Icon name="more" size={18} /></El>
      </div>

      <div style={{ display: 'flex', gap: 6, borderBottom: 'var(--border-w) solid var(--border)', marginBottom: 20 }}>
        {TABS.map(([id, label]) => {
          const on = tab === id;
          return <button key={id} onClick={() => app.setProjTab(id)} style={{ border: 'none', background: 'transparent', padding: '10px 4px', marginRight: 16, cursor: 'pointer', fontFamily: "'Inter Tight'", fontSize: 14, fontWeight: on ? 600 : 500, color: on ? 'var(--text)' : 'var(--text-subtle)', borderBottom: `2px solid ${on ? 'var(--text)' : 'transparent'}`, marginBottom: -1 }}>{label}</button>;
        })}
      </div>

      {tab === 'chats' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {PROJECT_CHATS.map((c) => (
            <El key={c.title} as="button" onClick={app.loadConvo}
              css="text-align:left;display:flex;align-items:center;gap:14px;border:var(--border-w) solid var(--border);background:var(--surface);border-radius:12px;padding:14px 16px;cursor:pointer"
              hover="background:var(--hover);border-color:var(--border-strong)">
              <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="message" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{c.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-subtle)' }}>{c.meta}</span>
              </span>
              <span style={{ color: 'var(--text-subtle)', display: 'flex' }}><Icon name="more" size={16} /></span>
            </El>
          ))}
        </div>
      )}

      {tab === 'files' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
          {PROJECT_FILES.map((f) => (
            <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 11, border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 12, padding: 14 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="file" size={16} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-subtle)' }}>{f.size}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {tab === 'context' && (
        <div style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 12, padding: 18, fontSize: 14, lineHeight: 1.65, color: 'var(--text-muted)' }}>
          Custom instructions and knowledge added here are shared across every chat in this project, so NeuIQ always keeps your positioning, tone and constraints in mind.
        </div>
      )}
    </div>
  );
}

function Chip({ icon, label }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)', background: 'var(--surface)', border: 'var(--border-w) solid var(--border)', borderRadius: 999, padding: '4px 11px' }}>
      <Icon name={icon} size={14} />{label}
    </span>
  );
}
