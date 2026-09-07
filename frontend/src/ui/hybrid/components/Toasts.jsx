import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';

/**
 * Toasts — the transient confirmation stack, bottom-right.
 *
 * Read-only: the queue and its expiry live in AppContext, so a toast pushed from anywhere
 * (including another screen that has since unmounted) still shows and still clears itself.
 */
export default function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map(t => (
        <div className="toast success" key={t.id}><Icon name="check" size={15} />{t.text}</div>
      ))}
    </div>
  );
}
