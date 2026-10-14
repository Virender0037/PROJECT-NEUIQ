import { EMPTY } from '@shared/data/emptyStates.js';
import EmptyPanel from '../components/EmptyPanel.jsx';

/**
 * Dashboard — workspace activity at a glance.
 *
 * Telemetry about USING NeuIQ (chats, messages, streaks), not about the Zoho People data —
 * that is Analytics. They stay apart because they need different backends, and this one needs
 * an event pipeline that does not exist yet.
 *
 * Until it does, this screen says so. It used to show invented figures (chat and message counts,
 * a weekly usage chart, recent activity and work), unlabelled, beside screens that show real HR
 * data; a made-up number next to a real one makes both untrustworthy. No figure appears here
 * until there is a source for it, and none is substituted when one is unavailable.
 */
export default function Dashboard() {
  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: '6px 26px 40px' }}>
      <EmptyPanel state={EMPTY.overview} />
    </div>
  );
}
