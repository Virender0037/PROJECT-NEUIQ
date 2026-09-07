import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';
import { navSections } from '../lib/nav.js';

/**
 * Dock — the Hybrid shell's primary navigation, a floating panel detached from the main
 * container. Every destination is visible and grouped (no hover menus to hunt through) and
 * the active item is marked by a single sliding span rather than a per-item background, so
 * the highlight travels. The indicator animates `transform` only, so the slide is composited.
 */
export default function Dock({ active, onNavigate, collapsed, onToggle, width, onResize }) {
  const listRef = useRef(null);
  const itemRefs = useRef({});
  const barRef = useRef(null);
  const dragRef = useRef(null);
  const sections = navSections();

  // collapsed-mode tooltip, portaled to <body> so the list's overflow cannot clip it
  const [tip, setTip] = useState(null);
  const showTip = (e, label) => {
    if (!collapsed) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 12 });
  };
  const hideTip = () => setTip(null);
  useEffect(() => { if (!collapsed) setTip(null); }, [collapsed]);

  // drag the right border to resize; the main container is flex:1 and just reflows
  const onEdgeDown = (e) => {
    if (collapsed) return;
    e.preventDefault();
    dragRef.current = { x0: e.clientX, w0: width };
    const move = (ev) => {
      const d = dragRef.current; if (!d) return;
      onResize(Math.max(184, Math.min(420, d.w0 + (ev.clientX - d.x0))));
    };
    const up = () => { dragRef.current = null; window.removeEventListener('pointermove', move); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  // keyboard-resizable too — a drag handle that only works with a mouse is a dead end
  const onEdgeKey = (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onResize(Math.max(184, width - 16)); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onResize(Math.min(420, width + 16)); }
  };

  const moveBar = useCallback(() => {
    const bar = barRef.current;
    if (!bar) return;
    const el = itemRefs.current[active];
    if (!el) { bar.style.opacity = '0'; return; }
    bar.style.opacity = '1';
    bar.style.height = el.offsetHeight + 'px';
    bar.style.transform = `translateY(${el.offsetTop}px)`;
  }, [active]);

  // pre-paint, so the span and the text colour change together
  useLayoutEffect(() => { moveBar(); }, [active, collapsed, moveBar]);
  useEffect(() => {
    const bar = barRef.current;
    // snap without animating on first paint
    if (bar) { bar.style.transition = 'none'; moveBar(); requestAnimationFrame(() => { if (bar) bar.style.transition = ''; }); }
    const onWinResize = () => moveBar();
    window.addEventListener('resize', onWinResize);
    if (document.fonts?.ready) document.fonts.ready.then(moveBar).catch(() => {});
    return () => window.removeEventListener('resize', onWinResize);
  }, [moveBar]);
  // the list scrolls independently; keep the indicator glued to its item
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onScroll = () => moveBar();
    list.addEventListener('scroll', onScroll, { passive: true });
    return () => list.removeEventListener('scroll', onScroll);
  }, [moveBar]);

  return (
    <aside className={'dock' + (collapsed ? ' mini' : '')} aria-label="Main navigation">
      <div className="dock-head">
        <span className="dock-logo"><Logo size={18} /></span>
        {!collapsed && (
          <div className="dock-brand">
            <span className="dock-name">NeuIQ</span>
            <span className="dock-sub">Zoho People</span>
          </div>
        )}
      </div>

      <nav className="dock-list" ref={listRef}>
        <span className="dock-bar" ref={barRef} aria-hidden="true" />
        {sections.map((sec, si) => (
          <div className="dock-sec" key={si}>
            {sec.title && !collapsed && <div className="dock-title">{sec.title}</div>}
            {sec.title && <div className="dock-rule" />}
            {sec.links.map((l) => (
              <button
                key={l.view}
                ref={(el) => { itemRefs.current[l.view] = el; }}
                className={'dock-link' + (active === l.view ? ' active' : '')}
                onClick={() => onNavigate(l.view)}
                onMouseEnter={(e) => showTip(e, l.label)}
                onMouseLeave={hideTip}
                onFocus={(e) => showTip(e, l.label)}
                onBlur={hideTip}
                aria-current={active === l.view ? 'page' : undefined}
              >
                <Icon name={l.icon} size={16} />
                {!collapsed && <span className="dock-label">{l.label}</span>}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className={'dock-edge' + (collapsed ? ' locked' : '')}
        onPointerDown={onEdgeDown} onKeyDown={onEdgeKey}
        role="separator" aria-orientation="vertical" tabIndex={collapsed ? -1 : 0}
        aria-label="Resize navigation" aria-valuenow={width} aria-valuemin={184} aria-valuemax={420}
        title={collapsed ? undefined : 'Drag to resize'} />
      <button className="dock-edge-btn" onClick={onToggle}
        aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        title={collapsed ? 'Expand' : 'Collapse'}>
        <Icon name="chevron" size={13} style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(90deg)' }} />
      </button>

      {tip && createPortal(
        <div className="dock-tip" style={{ top: tip.top, left: tip.left }} role="tooltip">{tip.label}</div>,
        document.body,
      )}
    </aside>
  );
}
