import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { EMPTY } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * ProjectWorkspace — one project's chats, files and standing instructions, once projects exist.
 *
 * The route stays reachable, so it needs a valid state of its own. It used to render a project
 * that does not exist ("AI Startup Assistant") with invented chats and files; each chat opened
 * the same canned transcript. "New chat" went too: a chat started here would not belong to any
 * project, so the button implied a scoping that does not happen.
 */
export default function ProjectWorkspace() {
  const app = useApp();
  return (
    <div className="view">
      <button
        className="btn ghost"
        onClick={() => app.go('projects')}
        style={{ marginBottom: 16, padding: '7px 13px', fontSize: 13 }}
      >
        <Icon name="chevron" size={15} style={{ transform: 'rotate(180deg)' }} />All projects
      </button>
      <EmptyPanel state={EMPTY.projectWorkspace} />
    </div>
  );
}
