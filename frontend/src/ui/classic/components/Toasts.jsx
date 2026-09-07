import { useApp } from '@shared/context/AppContext.jsx';

/**
 * Toasts — transient bottom-centre confirmations.
 *
 * Read-only: the queue and its expiry timers live in AppContext, so a toast pushed from a
 * screen that has since unmounted still shows and still clears itself.
 */
export default function Toasts() {
  const { toasts } = useApp();
  return (
    <div style={{ position: 'absolute', bottom: 22, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none', zIndex: 50 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 16px', background: 'var(--text)', color: 'var(--app-bg)', borderRadius: 11, boxShadow: 'var(--sh-lg)', fontSize: 13, fontWeight: 500, animation: 'nrToast .25s ease-out' }}>{t.text}</div>
      ))}
    </div>
  );
}
