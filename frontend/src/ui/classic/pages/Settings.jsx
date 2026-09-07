import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { PREFERENCES } from '@shared/data/mockData.js';
import { THEME_CARDS, ACCENT_SWATCHES, UI_STYLES, SETTINGS_SECTIONS } from '@shared/data/appearance.js';
import { sessionRows } from '@shared/lib/session.js';

/**
 * Settings — a 210px sub-nav beside one panel.
 *
 * The option SETS come from `shared/data/appearance.js`, which the Hybrid settings screen also
 * reads. That is deliberate: the two screens look nothing alike, but they must always offer the
 * same choices, and the only reliable way to guarantee that is to define them once.
 */
export default function Settings() {
  const app = useApp();

  // Compact mode leads the preference list, then the boolean prefs.
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
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '6px 26px 40px', display: 'flex', gap: 28 }}>
      <nav style={{ width: 210, flex: '0 0 auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {SETTINGS_SECTIONS.map(([id, label, icon]) => {
          const on = app.settingsTab === id;
          return (
            <El
              key={id}
              as="button"
              onClick={() => app.setSettingsTab(id)}
              css={`display:flex;align-items:center;gap:11px;height:32px;padding:0 12px;border:none;border-radius:9px;cursor:pointer;font-family:'Inter Tight';font-size:13.5px;text-align:left;color:${on ? 'var(--text)' : 'var(--text-muted)'};font-weight:${on ? 600 : 500};background:${on ? 'var(--active)' : 'transparent'}`}
              hover="background:var(--hover)"
            >
              <Icon name={icon} size={18} />{label}
            </El>
          );
        })}
      </nav>

      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 style={{ fontFamily: 'Geist', fontSize: 20, fontWeight: 600, letterSpacing: '-.01em', margin: '0 0 4px' }}>Appearance</h2>
        <p style={{ fontSize: 13.5, color: 'var(--text-subtle)', margin: '0 0 22px' }}>
          Choose how NeuIQ looks. Changes apply instantly and are remembered.
        </p>

        <Label>Interface</Label>
        <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: '-6px 0 12px' }}>
          The layout. Your theme and accent carry across whichever you pick.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
          {UI_STYLES.map((s) => {
            const on = app.uiStyle === s.id;
            return (
              <El
                key={s.id}
                as="button"
                onClick={() => !s.disabled && app.setUiStyle(s.id)}
                aria-pressed={on}
                aria-disabled={s.disabled || undefined}
                className="nr-lift"
                css={`display:flex;align-items:center;gap:13px;text-align:left;width:100%;padding:13px 15px;border:2px solid ${on ? 'var(--accent)' : 'var(--border)'};background:var(--surface);border-radius:13px;cursor:${s.disabled ? 'not-allowed' : 'pointer'};opacity:${s.disabled ? 0.55 : 1};font-family:'Inter Tight'`}
                hover={s.disabled ? '' : 'border-color:var(--border-strong)'}
              >
                <span style={{ width: 34, height: 34, flex: '0 0 auto', borderRadius: 10, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={s.icon} size={17} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{s.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--text-subtle)', marginTop: 1 }}>{s.sub}</span>
                </span>
                {on && <Tick />}
              </El>
            );
          })}
        </div>

        <Label>Theme</Label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 28 }}>
          {THEME_CARDS.map((tc) => {
            const on = app.theme === tc.id;
            return (
              <El
                key={tc.id}
                as="button"
                onClick={() => app.setTheme(tc.id)}
                aria-pressed={on}
                className="nr-lift"
                css={`text-align:left;border:2px solid ${on ? 'var(--accent)' : 'var(--border)'};background:var(--surface);border-radius:13px;padding:12px;cursor:pointer`}
                hover="border-color:var(--border-strong)"
              >
                {/* A miniature of the theme rather than a single swatch — a flat colour cannot
                    tell Dim from Dark, but a page-with-a-panel-on-it can. */}
                <span style={{ display: 'block', height: 56, borderRadius: 9, background: tc.bg, border: 'var(--border-w) solid var(--border)', marginBottom: 10, overflow: 'hidden', position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 8, top: 8, right: 8, bottom: 8, borderRadius: 6, background: tc.panel }} />
                  <span style={{ position: 'absolute', left: 14, bottom: 14, width: '46%', height: 5, borderRadius: 99, background: tc.ink, opacity: 0.55 }} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{tc.label}</span>
                  {on && <Tick />}
                </span>
              </El>
            );
          })}
        </div>

        <Label>Accent</Label>
        <p style={{ fontSize: 12.5, color: 'var(--text-subtle)', margin: '-6px 0 12px' }}>
          The mono themes ignore this — one hue is the whole point of them.
        </p>
        <div style={{ display: 'flex', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          {ACCENT_SWATCHES.map((a) => {
            const on = app.accent === a.id;
            return (
              <El
                key={a.id || 'default'}
                as="button"
                onClick={() => app.setAccent(a.id)}
                title={a.label}
                aria-label={a.label}
                aria-pressed={on}
                css={`width:36px;height:36px;border-radius:11px;cursor:pointer;background:${a.swatch};border:2px solid ${on ? 'var(--text)' : 'transparent'};box-shadow:var(--sh-xs);display:flex;align-items:center;justify-content:center;color:#fff;transition:transform .16s var(--ease)`}
                hover="transform:translateY(-2px)"
              >
                {on && <Icon name="check" size={16} />}
              </El>
            );
          })}
        </div>

        <Label>Session</Label>
        {/* Where the numbers come from belongs in Settings, not only in a toast. When a figure
            looks wrong this is the first screen anyone checks, so it has to say plainly whether
            the app is talking to the API and whose permissions are in force. The facts come from
            shared/lib/session.js, so Hybrid cannot show a different answer. */}
        <div style={{ marginBottom: 28, border: 'var(--border-w) solid var(--border)', borderRadius: 13, overflow: 'hidden' }}>
          {sessionRows(app).map((r, i) => (
            <div
              key={r.key}
              style={{
                display: 'flex', alignItems: 'baseline', gap: 14, padding: '13px 15px',
                borderTop: i === 0 ? 'none' : 'var(--border-w) solid var(--border)',
                background: 'var(--surface)',
              }}
            >
              <div style={{ width: 104, flex: '0 0 auto', fontSize: 12.5, color: 'var(--text-subtle)' }}>{r.label}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: r.warn ? 'var(--amber, var(--text))' : 'var(--text)' }}>{r.value}</div>
                {r.hint && <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 2, wordBreak: 'break-all' }}>{r.hint}</div>}
              </div>
            </div>
          ))}
        </div>

        <Label>Preferences</Label>
        <div style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 13, overflow: 'hidden' }}>
          {prefRows.map((pr, i) => (
            <div key={pr.key} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', borderTop: i === 0 ? 'none' : 'var(--border-w) solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 500, color: 'var(--text)' }}>{pr.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{pr.sub}</div>
              </div>
              <Toggle on={pr.on} onClick={pr.toggle} label={pr.title} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const Label = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{children}</div>
);

/** The selected-state check, used by every picker on this screen. */
const Tick = () => (
  <span style={{ width: 18, height: 18, flex: '0 0 auto', borderRadius: 999, background: 'var(--accent)', color: 'var(--accent-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <Icon name="check" size={12} />
  </span>
);

/**
 * Reusable switch. `left` is animated rather than the track's background alone, so the knob
 * travels instead of teleporting — the movement is what reads as "this turned on".
 */
export function Toggle({ on, onClick, label }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      aria-label={label}
      style={{
        width: 42, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--border-strong)', position: 'relative',
        transition: 'background var(--t-base) ease', flex: '0 0 auto', padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2, width: 20, height: 20, borderRadius: 999,
        background: '#fff', boxShadow: 'var(--sh-sm)', transition: 'left var(--t-base) var(--ease)',
      }} />
    </button>
  );
}
