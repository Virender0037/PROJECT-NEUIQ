import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import { EMPTY, COMING_SOON } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * ProjectsGrid — where projects will be listed.
 *
 * There is no project source yet. This screen used to show six invented projects with
 * descriptions and dates, under tabs and a sort control that changed nothing. It now says the
 * feature is not connected. The tabs and sort went with the list — controls over an empty,
 * unconnected list are controls that do nothing — and "New project" says it is coming.
 */
export default function ProjectsGrid() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontFamily: 'Geist', fontSize: 28, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Projects</h1>
        <El as="button" onClick={app.toast} aria-label={`New project (${COMING_SOON})`}
          css="display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text-subtle);border-radius:9px;cursor:pointer;font-size:13px;font-weight:500;font-family:'Inter Tight'"
          hover="background:var(--hover)"><Icon name="plus" size={16} />New project · {COMING_SOON}</El>
      </div>
      <EmptyPanel state={EMPTY.projects} />
    </div>
  );
}
