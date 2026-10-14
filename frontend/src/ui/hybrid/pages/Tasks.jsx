import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { EMPTY, COMING_SOON } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * Tasks.
 *
 * NeuIQ has no task source — no API, no store. This screen used to list five invented tasks
 * with due dates, tick boxes and an "N open of 5" count, which read as a working feature. It now
 * says the feature is not connected, and "New task" says it is coming rather than appearing to
 * do something.
 */
export default function Tasks() {
  const app = useApp();
  return (
    <div className="view">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1>Tasks</h1>
          <p>Task management is not connected yet.</p>
        </div>
        <button className="btn" onClick={app.toast} aria-label={`New task (${COMING_SOON})`}>
          <Icon name="plus" size={16} />New task · {COMING_SOON}
        </button>
      </div>
      <EmptyPanel state={EMPTY.tasks} />
    </div>
  );
}
