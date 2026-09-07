import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { HISTORY_FILTERS, HISTORY_PAGE } from '@shared/data/mockData.js';

/**
 * History — every past conversation, grouped by when.
 *
 * The filter chips are cosmetic for now; the groups come pre-bucketed from mock data. When the
 * backend lands, the buckets move server-side — a client that has to fetch everything to group
 * it cannot page.
 */
export default function History() {
  const app = useApp();
  return (
    <div className="view">
      <div className="page-head">
        <h1>Chat history</h1>
        <p>Everything you have asked, grouped by when.</p>
      </div>

      <div className="seg" style={{ marginBottom: 20 }}>
        {HISTORY_FILTERS.map((f) => (
          <button key={f} className={app.histFilter === f ? 'on' : ''} onClick={() => app.setHistFilter(f)}>{f}</button>
        ))}
      </div>

      {HISTORY_PAGE.map((group) => (
        <div key={group.label}>
          <div className="neuiq-group-label">{group.label}</div>
          <div className="neuiq-list">
            {group.items.map((it) => (
              <button className="neuiq-row" key={it.title} onClick={app.loadConvo}>
                <Icon name="message" size={16} />
                <span style={{ flex: 1, minWidth: 0 }}>{it.title}</span>
                {it.tag && <span className="chip">{it.tag}</span>}
                <span style={{ fontSize: 12, color: 'var(--ink-dim)', width: 34, textAlign: 'right' }}>{it.when}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
