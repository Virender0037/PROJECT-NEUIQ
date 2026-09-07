import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { GRID_PROJECTS } from '@shared/data/mockData.js';

/**
 * ProjectsGrid — project cards.
 *
 * A project is a folder for related chats, files and standing context. The your/shared segment
 * is real state (`app.pgTab`) but both tabs draw the same mock list until there is a backend
 * to distinguish them.
 */
export default function ProjectsGrid() {
  const app = useApp();
  return (
    <div className="view">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1>Projects</h1>
          <p>Group related chats, files and context in one place.</p>
        </div>
        <button className="btn primary" onClick={app.toast}><Icon name="plus" size={16} />New project</button>
      </div>

      <div className="seg" style={{ marginBottom: 18 }}>
        {['your', 'shared'].map((t) => (
          <button key={t} className={app.pgTab === t ? 'on' : ''} onClick={() => app.setPgTab(t)}>
            {t === 'your' ? 'Your projects' : 'Shared with you'}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(268px,1fr))', gap: 16 }}>
        {GRID_PROJECTS.map((p) => (
          <button
            key={p.name}
            className="card clickable"
            onClick={() => app.go('project')}
            style={{ textAlign: 'left', font: 'inherit', color: 'inherit' }}
          >
            <span className="k-icon" style={{ marginBottom: 12 }}><Icon name="folder" size={16} /></span>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 650 }}>{p.name}</span>
            <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginTop: 3 }}>{p.date}</span>
            {p.desc && (
              <span style={{ display: 'block', fontSize: 13, color: 'var(--ink-2)', marginTop: 10, lineHeight: 1.5 }}>
                {p.desc}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
