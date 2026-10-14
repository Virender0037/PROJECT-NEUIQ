import { EMPTY } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * History — past conversations.
 *
 * There is no conversation store yet: a chat lives in memory until the page closes. So this
 * screen says that, rather than listing invented conversations that each opened the same canned
 * transcript. The search box and filter chips went with them — controls that do nothing read as
 * a feature that works.
 *
 * When history is stored server-side, the bucketing (Today / Yesterday / ...) belongs there too:
 * a client that must fetch everything in order to group it cannot page.
 */
export default function History() {
  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '6px 26px 40px' }}>
      <EmptyPanel state={EMPTY.history} />
    </div>
  );
}
