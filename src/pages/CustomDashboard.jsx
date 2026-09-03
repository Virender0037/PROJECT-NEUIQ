import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { WIDGETS } from '../data/mockData.js';

/** Screen 5 — draggable widget grid (grip handles) + dashed "Add widget" tile. */
export default function CustomDashboard() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ fontSize: 13, color: 'var(--text-subtle)' }}>Drag widgets to rearrange your workspace</div>
        <El as="button" onClick={app.toast}
          css="display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:9px;cursor:pointer;font-family:'Inter Tight';font-size:13px;font-weight:500"
          hover="background:var(--hover)"><Icon name="plus" size={16} />Add widget</El>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
        {WIDGETS.map((wg) => (
          <div key={wg.title} style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 16, boxShadow: 'var(--sh-xs)', gridColumn: `span ${wg.span}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ color: 'var(--text-subtle)', cursor: 'grab', display: 'flex' }}><Icon name="grip" size={16} /></span>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1 }}>{wg.title}</span>
              <span style={{ color: 'var(--text-subtle)', display: 'flex' }}><Icon name="more" size={16} /></span>
            </div>
            <div style={{ fontFamily: 'Geist', fontSize: 26, fontWeight: 600, color: 'var(--text)' }}>{wg.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 3 }}>{wg.sub}</div>
          </div>
        ))}
        <El as="button" onClick={app.toast}
          css="border:var(--border-w) dashed var(--border-strong);background:transparent;border-radius:14px;padding:16px;min-height:132px;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-subtle)"
          hover="background:var(--hover);color:var(--text)"><Icon name="plus" size={20} /><span style={{ fontSize: 13, fontWeight: 500 }}>Add widget</span></El>
      </div>
    </div>
  );
}
