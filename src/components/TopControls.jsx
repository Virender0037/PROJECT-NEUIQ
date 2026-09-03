import { useApp } from '../context/AppContext.jsx';
import El from './El.jsx';
import Icon from '../icons/Icon.jsx';

/** Floating incognito indicator (top-left) + chat action controls (top-right). */
export default function TopControls() {
  const app = useApp();
  const isChatLike = app.view === 'chat' || app.view === 'empty' || app.view === 'incognito';

  return (
    <>
      {app.incognito && (
        <div style={{ position: 'absolute', top: 12, left: 16, zIndex: 30, display: 'flex', alignItems: 'center', gap: 7, height: 34, padding: '0 13px', border: 'var(--border-w) solid var(--border)', background: 'var(--elevated)', borderRadius: 999, fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', color: 'var(--text-muted)' }}><Icon name="lock" size={14} /></span>
          Private · Not saved
        </div>
      )}

      <div style={{ position: 'absolute', top: 12, right: 16, zIndex: 30, display: 'flex', alignItems: 'center', gap: 7 }}>
        {isChatLike && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <CircleBtn icon="share" title="Share" onClick={app.toast} />
            <CircleBtn icon="download" title="Export" onClick={app.toast} />
            <CircleBtn icon="more" title="More" onClick={app.toast} />
          </div>
        )}
      </div>
    </>
  );
}

function CircleBtn({ icon, title, onClick }) {
  return (
    <El as="button" onClick={onClick} title={title}
      css="width:34px;height:34px;border:var(--border-w) solid var(--border);background:var(--elevated);color:var(--text-muted);border-radius:999px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .12s,background .12s"
      hover="background:var(--hover);color:var(--text)"><Icon name={icon} size={18} /></El>
  );
}
