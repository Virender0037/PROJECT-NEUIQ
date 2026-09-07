import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { PROJECT_CHATS, PROJECT_FILES } from '@shared/data/mockData.js';

const TABS = [['chats', 'Chats'], ['files', 'Files'], ['instructions', 'Instructions']];

/**
 * ProjectWorkspace — one project's chats, files and standing instructions.
 *
 * `app.projTab` holds the active tab in shared state rather than locally, so navigating away
 * and back returns you to the tab you were on.
 */
export default function ProjectWorkspace() {
  const app = useApp();
  return (
    <div className="view">
      <button
        className="btn ghost"
        onClick={() => app.go('projects')}
        style={{ marginBottom: 16, padding: '7px 13px', fontSize: 13 }}
      >
        <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />All projects
      </button>

      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1>AI Startup Assistant</h1>
          <p>Go-to-market plan, positioning and launch roadmap.</p>
        </div>
        <button className="btn primary" onClick={app.newChat}><Icon name="plus" size={16} />New chat</button>
      </div>

      <div className="seg" style={{ marginBottom: 18 }}>
        {TABS.map(([id, label]) => (
          <button key={id} className={app.projTab === id ? 'on' : ''} onClick={() => app.setProjTab(id)}>{label}</button>
        ))}
      </div>

      {app.projTab === 'chats' && (
        <div className="neuiq-list">
          {PROJECT_CHATS.map((c) => (
            <button className="neuiq-row" key={c.title} onClick={app.loadConvo}>
              <Icon name="message" size={16} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{c.title}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)' }}>{c.meta}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {app.projTab === 'files' && (
        <div className="neuiq-list">
          {PROJECT_FILES.map((f) => (
            <button className="neuiq-row" key={f.name} onClick={app.toast}>
              <Icon name="file" size={16} />
              <span style={{ flex: 1, minWidth: 0 }}>{f.name}</span>
              <span className="chip">{f.size}</span>
            </button>
          ))}
        </div>
      )}

      {app.projTab === 'instructions' && (
        <div className="dw-card">
          <div className="dw-head">Project instructions</div>
          <p style={{ fontSize: 14, color: 'var(--ink-2)', lineHeight: 1.6 }}>
            Context added here is applied to every chat in this project.
          </p>
          <button className="btn ghost" onClick={app.toast} style={{ marginTop: 14 }}>
            <Icon name="plus" size={15} />Add instructions
          </button>
        </div>
      )}
    </div>
  );
}
