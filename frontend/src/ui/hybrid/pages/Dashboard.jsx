import { EMPTY } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * Dashboard — workspace activity at a glance.
 *
 * Distinct from Analytics: this is telemetry about USING NeuIQ (chats, messages, streaks),
 * whereas Analytics is about the Zoho People data itself. They come from different backends, and
 * this one needs an event pipeline that does not exist yet.
 *
 * Until it does, this screen says so. It used to show invented figures (chat and message counts,
 * a weekly usage chart, recent activity and work), unlabelled, beside screens that show real HR
 * data. No figure appears here until there is a source for it, and none is substituted when one
 * is unavailable.
 */
export default function Dashboard() {
  return (
    <div className="view">
      <div className="page-head">
        <h1>Overview</h1>
        <p>Activity across your workspace.</p>
      </div>
      <EmptyPanel state={EMPTY.overview} />
    </div>
  );
}
