import { useEffect, useRef, useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { THEMES, ACCENTS, themeIcon } from '@shared/lib/theme.js';
import { UI_STYLES } from '@shared/data/appearance.js';
import { VIEW_TITLE } from '../lib/nav.js';
import { profileFor } from '@shared/lib/profile.js';

/**
 * TopBar — page title on the left, tool capsule on the right.
 *
 * Deliberately lighter than the dock: navigation lives there, so this carries only what is
 * about the *current* page or the person using it (new chat, search, appearance, account).
 */
export default function TopBar({ view }) {
  const app = useApp();
  const me = profileFor(app.user);
  const { theme, accent } = app;
  const [menu, setMenu] = useState(null);   // 'theme' | 'user' | null
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (!wrapRef.current?.contains(e.target)) setMenu(null); };
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const title = app.incognito ? VIEW_TITLE.incognito : (VIEW_TITLE[view] || 'NeuIQ');

  return (
    <header className="topbar" ref={wrapRef}>
      <div className="tb-title">
        {title}
        {app.incognito && <span className="chip" style={{ marginLeft: 10 }}>Not saved</span>}
      </div>

      <div className="capsule tools">
        <button className="icon-sq" onClick={app.newChat} title="New chat" aria-label="New chat">
          <Icon name="plus" size={17} />
        </button>
        <button className="icon-sq" onClick={app.openSearch} title="Search (⌘K)" aria-label="Search">
          <Icon name="search" size={17} />
        </button>
        <button className="icon-sq" onClick={app.toggleIncognito}
          title={app.incognito ? 'Leave private chat' : 'Private chat'}
          aria-pressed={app.incognito} aria-label="Private chat">
          <Icon name="eyeOff" size={17} />
        </button>

        <div style={{ position: 'relative' }}>
          <button className="icon-sq" onClick={() => setMenu(m => (m === 'theme' ? null : 'theme'))}
            title="Appearance" aria-haspopup="menu" aria-expanded={menu === 'theme'} aria-label="Appearance">
            <Icon name="palette" size={17} />
          </button>
          {menu === 'theme' && (
            <div className="nav-menu right open" role="menu"
              style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, left: 'auto', minWidth: 200, zIndex: 200 }}>
              <div className="dock-title" style={{ padding: '6px 10px 4px' }}>Theme</div>
              {THEMES.map((t) => (
                <button key={t.id} role="menuitemradio" aria-checked={theme === t.id}
                  className={'mn-link' + (theme === t.id ? ' active' : '')}
                  style={{ padding: '9px 12px', fontSize: 13.5 }}
                  onClick={() => app.setTheme(t.id)}>
                  <Icon name={themeIcon(t.id)} size={15} />
                  {t.label}
                  {theme === t.id && <span style={{ marginLeft: 'auto' }}><Icon name="check" size={15} /></span>}
                </button>
              ))}
              <div className="dock-rule" />
              <div className="dock-title" style={{ padding: '6px 10px 4px' }}>UI style</div>
              {UI_STYLES.map((s) => (
                <button key={s.id} role="menuitemradio" aria-checked={app.uiStyle === s.id}
                  className={'mn-link' + (app.uiStyle === s.id ? ' active' : '')}
                  style={{ padding: '9px 12px', fontSize: 13.5, opacity: s.disabled ? 0.5 : 1 }}
                  disabled={s.disabled}
                  onClick={() => app.setUiStyle(s.id)}>
                  <Icon name={s.icon} size={15} />{s.label}
                  {app.uiStyle === s.id && <span style={{ marginLeft: 'auto' }}><Icon name="check" size={15} /></span>}
                </button>
              ))}
              <div className="dock-rule" />
              <div className="dock-title" style={{ padding: '6px 10px 4px' }}>Accent</div>
              <div style={{ display: 'flex', gap: 6, padding: '4px 10px 8px' }}>
                {ACCENTS.map((a) => (
                  <button key={a.id || 'default'} title={a.label} aria-label={a.label}
                    aria-pressed={accent === a.id} onClick={() => app.setAccent(a.id)}
                    style={{
                      width: 26, height: 26, borderRadius: 6, cursor: 'pointer', background: a.swatch,
                      border: accent === a.id ? '2px solid var(--ink)' : '1px solid var(--hairline)',
                    }} />
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button className="icon-sq" onClick={() => setMenu(m => (m === 'user' ? null : 'user'))}
            title={`Account: ${me.name}`} aria-haspopup="menu" aria-expanded={menu === 'user'} aria-label={`Account: ${me.name}, ${me.role}`}>
            {me.initials ? <span style={{ fontSize: 12.5, fontWeight: 700 }}>{me.initials}</span> : <Icon name="user" size={17} />}
          </button>
          {menu === 'user' && (
            <div className="nav-menu right open" role="menu"
              style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, left: 'auto', minWidth: 190, zIndex: 200 }}>
              {/* The same identity Classic's sidebar shows — the authenticated user, from
                  shared/lib/profile.js, with "User" rather than an invented name if one is missing. */}
              <div role="presentation" style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--line, rgba(0,0,0,.08))', marginBottom: 4 }}>
                <div style={{ fontSize: 13.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{me.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-dim)' }}>{me.role}</div>
              </div>
              <button className="mn-link" style={{ padding: '10px 12px', fontSize: 13.5 }}
                onClick={() => { setMenu(null); app.go('settings'); }}>
                <Icon name="settings" size={15} />Settings
              </button>
              <button className="mn-link danger" style={{ padding: '10px 12px', fontSize: 13.5 }}
                onClick={() => { setMenu(null); app.logout(); }}>
                <Icon name="logout" size={15} />Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
