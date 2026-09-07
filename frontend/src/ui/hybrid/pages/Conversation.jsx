import { useApp } from '@shared/context/AppContext.jsx';
import { UserMessage, AiMessage, ThinkingPill, StreamingMessage } from '../components/ChatMessage.jsx';

/**
 * Conversation — the message list.
 *
 * Three states can be on screen at once and they are separate on purpose: settled messages,
 * the thinking pill, and the partially-revealed streaming reply. Merging the last two into the
 * message array would mean mutating a committed message on every tick.
 */
export default function Conversation() {
  const app = useApp();
  return (
    <div className="view neuiq-chat" data-nr-scroll="1">
      {app.messages.map(m => (
        m.role === 'user'
          ? <UserMessage key={m.id} text={m.text} />
          : <AiMessage key={m.id} blocks={m.blocks} meta={m.meta} />
      ))}
      {app.thinking && <ThinkingPill />}
      {app.streaming && !app.thinking && app.streamText && <StreamingMessage text={app.streamText} />}
    </div>
  );
}
