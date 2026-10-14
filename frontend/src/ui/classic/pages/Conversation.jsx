import { useApp } from '@shared/context/AppContext.jsx';
import { UserMessage, AiMessage, ChatNotice, ThinkingPill, StreamingMessage } from '../components/ChatMessage.jsx';

/**
 * Conversation — the message list.
 *
 * Three states can be on screen at once and they are kept separate on purpose: settled
 * messages, the thinking pill, and the partially-revealed streaming reply. Folding the last
 * two into the message array would mean mutating a committed message on every tick.
 */
export default function Conversation() {
  const app = useApp();
  const compact = app.density === 'compact';
  const gap = compact ? 12 : 20;
  const pad = compact ? '4px 24px 28px' : '6px 24px 34px';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: pad, display: 'flex', flexDirection: 'column', gap }}>
      {app.messages.map((m) =>
        m.role === 'user'
          ? <UserMessage key={m.id} text={m.text} />
          : m.role === 'notice'
            ? <ChatNotice key={m.id} notice={m} />
            : <AiMessage key={m.id} blocks={m.blocks} meta={m.meta} />
      )}
      {app.thinking && <ThinkingPill />}
      {app.streamText && <StreamingMessage text={app.streamText} />}
    </div>
  );
}
