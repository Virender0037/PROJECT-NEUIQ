import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { PREFERENCES } from '@shared/data/mockData.js';
import { THEME_CARDS, ACCENT_SWATCHES, UI_STYLES, SETTINGS_SECTIONS } from '@shared/data/appearance.js';
import { sessionRows } from '@shared/lib/session.js';

/**
 * Settings — the same options as the Classic screen, in this style's visual language.
 *
 * Both read their option sets from `shared/data/appearance.js`, so the two can never offer
 * different choices. What differs is only how they are drawn.
 */

function Toggle({ on, onClick, label }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="hy-toggle"
      data-on={on ? '1' : undefined}
    >
      <span />
    </button>
  );
}

const Tick = () => (
  <span className="hy-tick"><Icon name="check" size={12} /></span>
);

export default function Settings() {
  const app = useApp();

  const prefRows = [
    {
      key: '__density',
      title: 'Compact mode',
      sub: 'Tighten spacing and density across the workspace',
      on: app.density === 'compact',
      toggle: app.toggleDensity,
    },
    ...PREFERENCES.map((p) => ({
      key: p.key, title: p.title, sub: p.sub,
      on: app.prefs[p.key], toggle: () => app.togglePref(p.key),
    })),
  ];

  return (
    <div className="view">
      <div className="page-head">
        <h1>Settings</h1>
        <p>Choose how NeuIQ looks. Changes apply instantly and are remembered.</p>
      </div>

      <div className="seg" style={{ marginBottom: 22 }}>
        {SETTINGS_SECTIONS.map(([id, label]) => (
          <button key={id} className={app.settingsTab === id ? 'on' : ''} onClick={() => app.setSettingsTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {app.settingsTab === 'appearance' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="dw-card">
            <div className="dw-head">Interface</div>
            <p className="hy-sub">The layout. Your theme and accent carry across whichever you pick.</p>
            <div className="hy-stylelist">
              {UI_STYLES.map((s) => (
                <button
                  key={s.id}
                  className={'hy-stylerow' + (app.uiStyle === s.id ? ' on' : '')}
                  onClick={() => !s.disabled && app.setUiStyle(s.id)}
                  aria-pressed={app.uiStyle === s.id}
                  aria-disabled={s.disabled || undefined}
                  disabled={s.disabled}
                >
                  <span className="k-icon"><Icon name={s.icon} size={17} /></span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 650 }}>{s.label}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--ink-dim)', marginTop: 1 }}>{s.sub}</span>
                  </span>
                  {app.uiStyle === s.id && <Tick />}
                </button>
              ))}
            </div>
          </div>

          <div className="dw-card">
            <div className="dw-head">Theme</div>
            <div className="hy-themegrid">
              {THEME_CARDS.map((tc) => (
                <button
                  key={tc.id}
                  className={'hy-themecard' + (app.theme === tc.id ? ' on' : '')}
                  onClick={() => app.setTheme(tc.id)}
                  aria-pressed={app.theme === tc.id}
                >
                  {/* A miniature of the theme, not a flat swatch — a single colour cannot tell
                      Dim from Dark, but a page with a panel on it can. */}
                  <span className="hy-themeprev" style={{ background: tc.bg }}>
                    <span style={{ position: 'absolute', inset: 8, borderRadius: 5, background: tc.panel }} />
                    <span style={{ position: 'absolute', left: 14, bottom: 14, width: '46%', height: 5, borderRadius: 99, background: tc.ink, opacity: 0.55 }} />
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 650 }}>{tc.label}</span>
                    {app.theme === tc.id && <Tick />}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="dw-card">
            <div className="dw-head">Accent</div>
            <p className="hy-sub">The mono themes ignore this — one hue is the whole point of them.</p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {ACCENT_SWATCHES.map((a) => (
                <button
                  key={a.id || 'default'}
                  className={'hy-accent' + (app.accent === a.id ? ' on' : '')}
                  style={{ background: a.swatch }}
                  onClick={() => app.setAccent(a.id)}
                  title={a.label}
                  aria-label={a.label}
                  aria-pressed={app.accent === a.id}
                >
                  {app.accent === a.id && <Icon name="check" size={16} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : app.settingsTab === 'account' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="dw-card">
            <div className="dw-head">Session</div>
            {/* Where the numbers come from belongs in Settings, not only in a toast. When a
                figure looks wrong this is the first screen to check, so it has to say plainly
                whether the app is talking to the API and whose permissions are in force. */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {sessionRows(app).map((r, i) => (
                <div
                  key={r.key}
                  style={{
                    display: 'flex', alignItems: 'baseline', gap: 14, padding: '13px 0',
                    borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                  }}
                >
                  <div style={{ width: 110, flex: '0 0 auto', fontSize: 12.5, color: 'var(--ink-2)' }}>{r.label}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: r.warn ? 'var(--warn)' : 'var(--ink)' }}>{r.value}</div>
                    {r.hint && <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 2, wordBreak: 'break-all' }}>{r.hint}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="dw-card">
            <div className="dw-head">Sign out</div>
            <p className="hy-sub">Clears the token on this device. Saved dashboards stay on the server.</p>
            <button className="btn ghost" onClick={app.logout}><Icon name="logout" size={15} />Sign out</button>
          </div>
        </div>
      ) : (
        <div className="dw-card">
          <div className="dw-head">Preferences</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {prefRows.map((pr, i) => (
              <div
                key={pr.key}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
                  borderTop: i === 0 ? 'none' : '1px solid var(--hairline)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{pr.title}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 2 }}>{pr.sub}</div>
                </div>
                <Toggle on={pr.on} onClick={pr.toggle} label={pr.title} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
