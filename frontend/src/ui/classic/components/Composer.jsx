import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';

/**
 * Composer — the message input. Send button cycles through:
 *   empty    -> waveform (voice mode)
 *   has text -> accent send arrow
 *   streaming-> filled stop square
 */
export default function Composer() {
  const app = useApp();
  const hasText = app.composer.trim().length > 0;
  const showSend = hasText || app.streaming;
  const showWave = !hasText && !app.streaming;

  const sendBg = app.streaming ? 'var(--text)' : 'var(--accent)';
  const sendFg = app.streaming ? 'var(--app-bg)' : 'var(--accent-fg)';
  const sendTitle = app.streaming ? 'Stop' : 'Send';

  const onComposer = (e) => {
    app.setComposer(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); app.send(); } };

  return (
    <div style={{ flex: '0 0 auto', padding: '0 24px 16px', background: 'linear-gradient(to top,var(--app-bg) 60%,transparent)' }}>
      <div style={{ maxWidth: 740, margin: '0 auto' }}>
        {app.incognito && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--text-subtle)', marginBottom: 8 }}>
            <Icon name="lock" size={14} />This chat won't be saved to your history.
          </div>
        )}
        <div style={{ border: 'var(--border-w) solid var(--border-strong)', background: 'var(--elevated)', borderRadius: 20, boxShadow: 'var(--sh-sm)', padding: '6px 8px 6px 16px', backdropFilter: 'var(--blur)', WebkitBackdropFilter: 'var(--blur)' }}>
          <textarea
            value={app.composer}
            onChange={onComposer}
            onKeyDown={onKey}
            placeholder="Write a message…"
            rows={1}
            style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', resize: 'none', color: 'var(--text)', fontSize: 15, lineHeight: 1.55, padding: '9px 4px 4px', maxHeight: 160, fontFamily: "'Inter Tight'" }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <IconBtn icon="plus" title="Attach" onClick={app.toast} />
            <IconBtn icon="wrench" title="Tools" onClick={app.toast} />
            <div style={{ flex: 1 }} />
            <El as="button" onClick={app.toast}
              css="display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:none;background:transparent;color:var(--text);border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;font-family:'Inter Tight'"
              hover="background:var(--hover)">
              <span>NeuIQ Pro</span>
              <span style={{ color: 'var(--text-subtle)', fontWeight: 500 }}>High</span>
              <Icon name="chevron" size={14} />
            </El>
            <IconBtn icon="mic" title="Voice" onClick={app.toast} />
            {showWave && <IconBtn icon="wave" title="Voice mode" onClick={app.toast} />}
            {showSend && (
              <El as="button" onClick={app.sendOrStop} title={sendTitle}
                css={`width:32px;height:32px;border:none;background:${sendBg};color:${sendFg};border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s,transform .08s`}
                active="transform:translateY(.5px)">
                <Icon name={app.streaming ? 'square' : 'arrowUp'} size={18} />
              </El>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--text-subtle)', marginTop: 8 }}>NeuIQ can make mistakes. Verify important information.</div>
      </div>
    </div>
  );
}

function IconBtn({ icon, title, onClick }) {
  return (
    <El as="button" onClick={onClick} title={title}
      css="width:32px;height:32px;border:none;background:transparent;color:var(--text-muted);border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center"
      hover="background:var(--hover);color:var(--text)"><Icon name={icon} size={18} /></El>
  );
}
