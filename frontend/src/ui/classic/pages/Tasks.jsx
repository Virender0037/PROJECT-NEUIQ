import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { EMPTY, COMING_SOON } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * Tasks.
 *
 * NeuIQ has no task source — no API, no store. This screen used to list five invented tasks
 * with due dates and tick boxes, which read as a working feature. It now says the feature is not
 * connected, and "New task" says it is coming rather than appearing to do something.
 */
export default function Tasks() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Geist', fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Tasks</h1>
        <El as="button" onClick={app.toast} aria-label={`New task (${COMING_SOON})`}
          css="display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text-subtle);border-radius:9px;cursor:pointer;font-size:13px;font-weight:500;font-family:'Inter Tight'"
          hover="background:var(--hover)"><Icon name="plus" size={16} />New task · {COMING_SOON}</El>
      </div>
      <EmptyPanel state={EMPTY.tasks} />
    </div>
  );
}
