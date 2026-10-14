import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { EMPTY } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * ProjectWorkspace — one project's chats, files and standing instructions, once projects exist.
 *
 * The route stays reachable, so it needs a valid state of its own. It used to render a project
 * that does not exist ("AI Startup Assistant", "12 chats", "24 documents", "Updated today") with
 * invented chats and files; each chat opened the same canned transcript. It now says the
 * workspace is not connected and links back to Projects.
 */
export default function ProjectWorkspace() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '6px 26px 40px' }}>
      <El as="button" onClick={() => app.go('projects')}
        css="display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;margin-bottom:16px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text-muted);border-radius:9px;cursor:pointer;font-size:13px;font-family:'Inter Tight'"
        hover="background:var(--hover);color:var(--text)">
        <span style={{ display: 'flex', transform: 'rotate(180deg)' }}><Icon name="chevron" size={15} /></span>All projects
      </El>
      <EmptyPanel state={EMPTY.projectWorkspace} />
    </div>
  );
}
