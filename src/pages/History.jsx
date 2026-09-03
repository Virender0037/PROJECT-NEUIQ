import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { HISTORY_FILTERS, HISTORY_PAGE } from '../data/mockData.js';

/** Screen 7 — search bar, filter chips, date-grouped rows with project tags. */
export default function History() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, height: 44, padding: '0 14px', border: 'var(--border-w) solid var(--border-strong)', background: 'var(--surface)', borderRadius: 11, marginBottom: 16 }}>
        <span style={{ color: 'var(--text-subtle)', display: 'flex' }}><Icon name="search" size={18} /></span>
        <span style={{ color: 'var(--text-subtle)', fontSize: 14 }}>Search conversations…</span>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 22, flexWrap: 'wrap' }}>
        {HISTORY_FILTERS.map((f) => {
          const on = app.histFilter === f;
          return (
            <El key={f} as="button" onClick={() => app.setHistFilter(f)}
              css={`height:32px;padding:0 14px;border:var(--border-w) solid ${on ? 'var(--border-strong)' : 'var(--border)'};background:${on ? 'var(--active)' : 'var(--surface)'};color:${on ? 'var(--text)' : 'var(--text-muted)'};border-radius:999px;cursor:pointer;font-size:12.5px;font-weight:${on ? 600 : 500};font-family:'Inter Tight'`}
              hover="filter:brightness(.98)">{f}</El>
          );
        })}
      </div>

      {HISTORY_PAGE.map((grp) => (
        <div key={grp.label}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text-subtle)', margin: '18px 0 8px' }}>{grp.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {grp.items.map((c) => (
              <El key={c.title} as="button" onClick={app.loadConvo}
                css="text-align:left;display:flex;align-items:center;gap:12px;padding:12px 14px;border:var(--border-w) solid transparent;background:transparent;border-radius:11px;cursor:pointer"
                hover="background:var(--surface);border-color:var(--border)">
                <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name="message" size={16} /></span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.title}</span>
                </span>
                {c.tag && <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface-2)', borderRadius: 999, padding: '3px 9px', fontWeight: 500 }}>{c.tag}</span>}
                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{c.when}</span>
              </El>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
