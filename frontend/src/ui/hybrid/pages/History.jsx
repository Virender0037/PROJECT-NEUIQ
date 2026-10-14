import { EMPTY } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * History — past conversations.
 *
 * There is no conversation store yet: a chat lives in memory until the page closes. So this
 * screen says that, rather than listing invented conversations that each opened the same canned
 * transcript. The filter chips went with them — controls that do nothing read as a feature that
 * works.
 *
 * When history is stored server-side, the bucketing belongs there too: a client that has to
 * fetch everything to group it cannot page.
 */
export default function History() {
  return (
    <div className="view">
      <div className="page-head">
        <h1>Chat history</h1>
        <p>Past conversations appear here once history is stored.</p>
      </div>
      <EmptyPanel state={EMPTY.history} />
    </div>
  );
}
