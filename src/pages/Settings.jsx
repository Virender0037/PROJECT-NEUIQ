import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { SETTINGS_TABS, THEME_CARDS, PREFERENCES } from '../data/mockData.js';

/** Screen 8 — 210px subnav + panel; theme selector + preference toggles. */
export default function Settings() {
  const app = useApp();

  // Compact mode leads the preference list, then the boolean prefs.
  const prefRows = [
    { key: '__density', title: 'Compact mode', sub: 'Tighten spacing and density across the workspace', on: app.density === 'compact', toggle: app.toggleDensity },
    ...PREFERENCES.map((p) => ({ key: p.key, title: p.title, sub: p.sub, on: app.prefs[p.key], toggle: () => app.togglePref(p.key) })),
  ];

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '6px 26px 40px', display: 'flex', gap: 28 }}>
      <nav style={{ width: 210, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SETTINGS_TABS.map(([id, label, icon]) => {
          const on = app.settingsTab === id;
          return (
            <El key={id} as="button" onClick={() => app.setSettingsTab(id)}
              css={`display:flex;align-items:center;gap:11px;height:32px;padding:0 12px;border:none;border-radius:9px;cursor:pointer;font-family:'Inter Tight';font-size:13.5px;text-align:left;color:${on ? 'var(--text)' : 'var(--text-muted)'};font-weight:${on ? 600 : 500};background:${on ? 'var(--active)' : 'transparent'}`}
              hover="background:var(--hover)"><Icon name={icon} size={18} />{label}</El>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontFamily: 'Geist', fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', margin: '0 0 4px' }}>Appearance</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-subtle)', margin: '0 0 22px' }}>Choose how NeuIQ looks. Changes apply instantly across the workspace.</p>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Theme</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 28 }}>
          {THEME_CARDS.map((tc) => {
            const on = app.theme === tc.id;
            return (
              <El key={tc.id} as="button" onClick={() => app.setTheme(tc.id)}
                css={`text-align:left;border:2px solid ${on ? 'var(--accent)' : 'var(--border)'};background:var(--surface);border-radius:13px;padding:12px;cursor:pointer;position:relative`}
                hover="border-color:var(--border-strong)">
                <span style={{ display: 'block', height: 56, borderRadius: 9, background: tc.swatch, border: 'var(--border-w) solid var(--border)', marginBottom: 10, overflow: 'hidden', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, bottom: 8, width: '55%', height: 6, borderRadius: 99, background: tc.dot }} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tc.label}</span>
                  {on && <span style={{ width: 18, height: 18, borderRadius: 999, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={12} /></span>}
                </span>
              </El>
            );
          })}
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Preferences</div>
        <div style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 13, overflow: 'hidden' }}>
          {prefRows.map((pr, i) => (
            <div key={pr.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderTop: i === 0 ? 'none' : 'var(--border-w) solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{pr.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{pr.sub}</div>
              </div>
              <Toggle on={pr.on} onClick={pr.toggle} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Reusable switch used across settings. */
export function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} style={{ width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', background: on ? 'var(--accent)' : 'var(--border-strong)', position: 'relative', transition: 'background .18s', flex: '0 0 auto', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: 'var(--sh-sm)', transition: 'left .18s' }} />
    </button>
  );
}
