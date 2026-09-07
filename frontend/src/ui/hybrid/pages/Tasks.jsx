import { useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { TASKS } from '@shared/data/mockData.js';

/**
 * Tasks — a checklist.
 *
 * Tick state is local useState on purpose: nothing outside this screen needs it, and putting
 * it in shared state would re-render every consumer of useApp() on a checkbox click.
 */
export default function Tasks() {
  const app = useApp();
  // screen-only state: nothing else needs to know which boxes are ticked
  const [done, setDone] = useState(() => TASKS.map((t) => t.done));
  const toggle = (i) => setDone((d) => d.map((v, j) => (j === i ? !v : v)));
  const openCount = done.filter((d) => !d).length;

  return (
    <div className="view">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1>Tasks</h1>
          <p>{openCount} open of {TASKS.length}.</p>
        </div>
        <button className="btn primary" onClick={app.toast}><Icon name="plus" size={16} />New task</button>
      </div>

      <div className="neuiq-list">
        {TASKS.map((t, i) => (
          <div className="neuiq-row" key={t.title} style={{ cursor: 'default' }}>
            <button
              onClick={() => toggle(i)}
              role="checkbox"
              aria-checked={done[i]}
              aria-label={t.title}
              style={{
                width: 20,
                height: 20,
                flex: '0 0 auto',
                borderRadius: 4,
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
                border: done[i] ? 'none' : '1.5px solid var(--ink-dim)',
                background: done[i] ? 'var(--accent)' : 'transparent',
                color: '#fff',
              }}
            >
              {done[i] && <Icon name="check" size={13} />}
            </button>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: done[i] ? 'line-through' : 'none',
                color: done[i] ? 'var(--ink-dim)' : 'var(--ink)',
              }}
            >
              {t.title}
            </span>
            <span className="chip">{t.tag}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{t.due}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
