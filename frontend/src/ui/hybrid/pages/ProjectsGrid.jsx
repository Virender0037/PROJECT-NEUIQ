import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { EMPTY, COMING_SOON } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * ProjectsGrid — where projects will be listed.
 *
 * There is no project source yet. This screen used to show six invented projects with
 * descriptions and dates, under a your/shared segment that changed nothing. It now says the
 * feature is not connected, and "New project" says it is coming.
 */
export default function ProjectsGrid() {
  const app = useApp();
  return (
    <div className="view">
      <div className="page-head" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1>Projects</h1>
          <p>Group related chats, files and context in one place.</p>
        </div>
        <button className="btn" onClick={app.toast} aria-label={`New project (${COMING_SOON})`}>
          <Icon name="plus" size={16} />New project · {COMING_SOON}
        </button>
      </div>
      <EmptyPanel state={EMPTY.projects} />
    </div>
  );
}
