import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';

const iconBtn = {
  width: 32, height: 32, border: 'none', background: 'transparent', color: 'var(--ink-dim)',
  borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

/**
 * Composer — docked to the bottom of the main container, inside the pane rather than floating
 * over the window, which is what keeps it aligned with the shell's inset panels.
 */
export default function Composer() {
  const app = useApp();
  const hasText = app.composer.trim().length > 0;
  const showSend = hasText || app.streaming;

  const onComposer = (e) => {
    app.setComposer(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  };
  const onKey = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); app.send(); } };

  return (
    <div style={{ flex: '0 0 auto', padding: '0 26px 18px' }}>
      <div style={{ maxWidth: 780, margin: '0 auto' }}>
        {app.incognito && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, color: 'var(--ink-dim)', marginBottom: 8 }}>
            <Icon name="lock" size={14} />This chat won't be saved to your history.
          </div>
        )}
        <div style={{
          border: '1px solid var(--hairline)', background: 'var(--menu-bg)', borderRadius: 6,
          boxShadow: 'var(--shadow-sm)', padding: '6px 8px 6px 14px',
        }}>
          <textarea
            value={app.composer} onChange={onComposer} onKeyDown={onKey}
            placeholder="Ask about leave, attendance, or your team…" rows={1}
            aria-label="Message"
            style={{
              width: '100%', border: 'none', outline: 'none', background: 'transparent', resize: 'none',
              color: 'var(--ink)', fontSize: 14.5, lineHeight: 1.55, padding: '9px 4px 4px',
              maxHeight: 160, fontFamily: 'inherit',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <button style={iconBtn} onClick={app.toast} title="Attach" aria-label="Attach"><Icon name="paperclip" size={17} /></button>
            <button style={iconBtn} onClick={app.toast} title="Tools" aria-label="Tools"><Icon name="wrench" size={17} /></button>
            <div style={{ flex: 1 }} />
            <span className="chip" style={{ marginRight: 4 }}>NeuIQ Pro</span>
            <button style={iconBtn} onClick={app.toast} title="Voice" aria-label="Voice"><Icon name="mic" size={17} /></button>
            {showSend && (
              <button onClick={app.sendOrStop} title={app.streaming ? 'Stop' : 'Send'}
                aria-label={app.streaming ? 'Stop generating' : 'Send message'}
                style={{
                  width: 32, height: 32, border: 'none', borderRadius: 5, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                  background: app.streaming ? 'var(--ink)' : 'linear-gradient(135deg,var(--accent),var(--accent-2))',
                }}>
                <Icon name={app.streaming ? 'square' : 'arrowUp'} size={17} />
              </button>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-dim)', marginTop: 8 }}>
          NeuIQ answers from live Zoho People data. Verify anything you act on.
        </div>
      </div>
    </div>
  );
}
