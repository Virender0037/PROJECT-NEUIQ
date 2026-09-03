import { useApp } from '../context/AppContext.jsx';
import El from './El.jsx';
import Icon from '../icons/Icon.jsx';
import Logo from '../icons/Logo.jsx';
import { SIDE_PROJECTS, PINNED, HISTORY_GROUPS } from '../data/mockData.js';

const NAV = [
  ['dashboard', 'Dashboard', 'layoutGrid'],
  ['custom', 'Custom dashboard', 'sliders'],
  ['projects', 'Projects', 'folder'],
  ['tasks', 'Tasks', 'checkCircle'],
];

export default function Sidebar() {
  const app = useApp();
  const { collapsed, incognito, rowMenu } = app;
  const expanded = !collapsed;
  const ncJustify = collapsed ? 'center' : 'flex-start';
  const sbw = collapsed ? '72px' : app.sidebarWidth + 'px';
  const sbwTrans = app.resizing ? 'none' : 'width .3s cubic-bezier(.4,0,.2,1)';
  const sideOverflow = collapsed ? 'visible' : 'hidden auto';

  return (
    <aside
      style={{
        height: '100%', flex: '0 0 auto', width: sbw, background: 'var(--sidebar-bg)',
        borderRight: 'var(--border-w) solid var(--border)', display: 'flex', flexDirection: 'column',
        transition: sbwTrans, backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)',
        position: 'relative', zIndex: 5,
      }}
    >
      {/* brand */}
      <div style={{ height: 50, flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px 0 16px' }}>
        <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto', color: 'var(--text)' }}>
          <Logo size={27} stroke={1.6} />
        </div>
        {expanded && <div style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 17, letterSpacing: '-.02em', flex: 1 }}>NeuIQ</div>}
        <El as="button" onClick={app.toggleSidebar} title="Toggle sidebar (⌘B)"
          css="width:30px;height:30px;border:none;background:transparent;color:var(--text-muted);border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s"
          hover="background:var(--hover);color:var(--text)">
          <Icon name="panelLeft" size={18} />
        </El>
      </div>

      {/* new chat */}
      <div style={{ padding: '6px 12px 8px' }}>
        <El as="button" onClick={app.newChat} title="New chat (⌘N)" className="nr-tip"
          css={`width:100%;height:32px;display:flex;align-items:center;gap:10px;padding:0 11px;justify-content:${ncJustify};border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:10px;cursor:pointer;font-family:'Inter Tight';font-size:14px;font-weight:500;box-shadow:var(--sh-xs);transition:background .12s,transform .08s`}
          hover="background:var(--hover)" active="transform:translateY(.5px)">
          <span style={{ color: 'var(--accent)', display: 'flex' }}><Icon name="plus" size={18} /></span>
          {expanded && <span>New chat</span>}
          {collapsed && <span className="nr-tt">New chat</span>}
        </El>
      </div>

      <div style={{ flex: 1, overflow: sideOverflow, padding: '4px 12px 8px' }}>
        {/* nav */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }}>
          {NAV.map(([id, label, icon]) => {
            const on = app.view === id;
            return (
              <El key={id} as="button" onClick={() => app.go(id)} title={label} className="nr-tip"
                css={`display:flex;align-items:center;gap:11px;height:32px;padding:0 11px;justify-content:${ncJustify};border:none;border-radius:9px;cursor:pointer;font-family:'Inter Tight';font-size:14px;transition:background .12s,color .12s;color:${on ? 'var(--text)' : 'var(--text-muted)'};font-weight:${on ? 600 : 500};background:${on ? 'var(--active)' : 'transparent'}`}
                hover="background:var(--hover)">
                <Icon name={icon} size={18} />
                {expanded && <span>{label}</span>}
                {collapsed && <span className="nr-tt">{label}</span>}
              </El>
            );
          })}
        </div>

        {expanded && (
          <div>
            {/* projects list */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 10px 4px' }}>
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Projects</span>
              <El as="button" onClick={() => app.go('projects')}
                css="width:22px;height:22px;border:none;background:transparent;color:var(--text-subtle);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center"
                hover="background:var(--hover);color:var(--text)"><Icon name="plus" size={14} /></El>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {SIDE_PROJECTS.map((name) => (
                <El key={name} as="button" onClick={() => app.go('project')}
                  css="display:flex;align-items:center;gap:10px;height:30px;padding:0 10px;border:none;background:transparent;border-radius:8px;cursor:pointer;color:var(--text-muted);font-family:'Inter Tight';font-size:13.5px;text-align:left;width:100%"
                  hover="background:var(--hover);color:var(--text)">
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-subtle)', flex: '0 0 auto' }}><Icon name="folder" size={14} /></span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </El>
              ))}
            </div>

            {/* pinned */}
            <div style={{ padding: '12px 10px 4px' }}><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>Pinned</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {PINNED.map((name) => (
                <El key={name} as="button" onClick={app.loadConvo}
                  css="display:flex;align-items:center;gap:10px;height:30px;padding:0 10px;border:none;background:transparent;border-radius:8px;cursor:pointer;color:var(--text-muted);font-family:'Inter Tight';font-size:13.5px;text-align:left;width:100%"
                  hover="background:var(--hover);color:var(--text)">
                  <span style={{ color: 'var(--text-subtle)', flex: '0 0 auto', display: 'flex' }}><Icon name="star" size={14} filled /></span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                </El>
              ))}
            </div>

            {/* history */}
            {incognito ? (
              <div style={{ margin: '16px 6px 6px', padding: '16px 14px', border: 'var(--border-w) dashed var(--border-strong)', borderRadius: 12, textAlign: 'center', color: 'var(--text-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8, color: 'var(--text-muted)' }}><Icon name="lock" size={20} /></div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>History is hidden in a private chat.</div>
              </div>
            ) : (
              <div>
                {HISTORY_GROUPS.map((grp) => (
                  <div key={grp.label}>
                    <div style={{ padding: '12px 10px 4px' }}><span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-subtle)' }}>{grp.label}</span></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {grp.items.map((title, i) => {
                        const key = grp.label + '|' + i;
                        const open = rowMenu === key;
                        return (
                          <div key={key} className="nr-row">
                            <El as="button" onClick={app.loadConvo}
                              css="display:flex;align-items:center;gap:11px;height:30px;padding:0 30px 0 11px;border:none;background:transparent;border-radius:8px;cursor:pointer;color:var(--text-muted);font-family:'Inter Tight';font-size:13.5px;text-align:left;width:100%"
                              hover="background:var(--hover);color:var(--text)">
                              <span style={{ width: 5, height: 5, borderRadius: 999, border: '1.5px solid var(--text-subtle)', flex: '0 0 auto', boxSizing: 'border-box' }} />
                              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                            </El>
                            <El as="button" className="nr-row-more" data-open={open ? '1' : '0'} title="More"
                              onClick={(e) => { e.stopPropagation(); app.openRowMenu(key); }}
                              css="position:absolute;right:5px;top:50%;transform:translateY(-50%);width:23px;height:23px;border:none;background:transparent;color:var(--text-subtle);border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center"
                              hover="background:var(--active);color:var(--text)"><Icon name="more" size={16} /></El>
                            {open && (
                              <div style={{ position: 'absolute', right: 5, top: 29, zIndex: 40, minWidth: 158, background: 'var(--elevated)', border: 'var(--border-w) solid var(--border-strong)', borderRadius: 10, boxShadow: 'var(--sh-lg)', padding: 5, display: 'flex', flexDirection: 'column', gap: 1, animation: 'nrPop .16s ease-out' }}>
                                <RowMenuItem icon="share" label="Share" onClick={(e) => { e.stopPropagation(); app.closeRowMenu(); app.pushToast('Share link copied'); }} />
                                <RowMenuItem icon="download" label="Export" onClick={(e) => { e.stopPropagation(); app.closeRowMenu(); app.pushToast('Exporting chat…'); }} />
                                <div style={{ height: 1, background: 'var(--border)', margin: '3px 6px' }} />
                                <RowMenuItem icon="eyeOff" label="Private chat" onClick={(e) => { e.stopPropagation(); app.closeRowMenu(); app.toggleIncognito(); }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {rowMenu !== null && (
        <div onClick={app.closeRowMenu} style={{ position: 'fixed', inset: 0, zIndex: 35 }} />
      )}

      {/* bottom: search + profile */}
      <div style={{ flex: '0 0 auto', padding: '8px 12px 12px', borderTop: 'var(--border-w) solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <El as="button" onClick={app.openSearch} title="Search (⌘K)" className="nr-tip"
          css={`display:flex;align-items:center;gap:11px;height:32px;padding:0 12px;justify-content:${ncJustify};border:none;background:transparent;border-radius:9px;cursor:pointer;color:var(--text-muted);font-family:'Inter Tight';font-size:14px`}
          hover="background:var(--hover);color:var(--text)">
          <Icon name="search" size={18} />
          {expanded && <><span style={{ flex: 1, textAlign: 'left' }}>Search</span><kbd style={{ fontFamily: 'Geist Mono', fontSize: 11, color: 'var(--text-subtle)', border: 'var(--border-w) solid var(--border)', borderRadius: 5, padding: '1px 6px' }}>⌘K</kbd></>}
          {collapsed && <span className="nr-tt">Search</span>}
        </El>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <El as="button" onClick={() => app.go('settings')}
            css={`flex:1;min-width:0;display:flex;align-items:center;gap:10px;padding:6px;border:none;background:transparent;border-radius:10px;cursor:pointer;text-align:left;justify-content:${ncJustify}`}
            hover="background:var(--hover)">
            <span style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, flex: '0 0 auto', fontFamily: 'Geist' }}>AM</span>
            {expanded && (
              <span style={{ flex: 1, overflow: 'hidden' }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Alex Morgan</span>
                <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-subtle)' }}>Pro plan</span>
              </span>
            )}
          </El>
          {expanded && (
            <El as="button" onClick={app.logout} title="Log out"
              css="width:32px;height:32px;flex:0 0 auto;border:none;background:transparent;color:var(--text-subtle);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center"
              hover="background:var(--hover);color:var(--text)"><Icon name="logout" size={18} /></El>
          )}
        </div>
      </div>

      {expanded && (
        <div onMouseDown={app.startResize} title="Drag to resize" style={{ position: 'absolute', top: 0, right: -3, width: 7, height: '100%', cursor: 'col-resize', zIndex: 20 }} />
      )}
    </aside>
  );
}

function RowMenuItem({ icon, label, onClick }) {
  return (
    <El as="button" onClick={onClick}
      css="display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border:none;background:transparent;border-radius:7px;cursor:pointer;color:var(--text);font-family:'Inter Tight';font-size:13px;text-align:left;width:100%"
      hover="background:var(--hover)"><Icon name={icon} size={16} />{label}</El>
  );
}
