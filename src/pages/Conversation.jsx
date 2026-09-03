import { useApp } from '../context/AppContext.jsx';
import { UserMessage, AiMessage, ThinkingPill, StreamingMessage } from '../components/ChatMessage.jsx';

/** Screens 2 & 3 — active conversation, thinking pill, live streaming. */
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
          : <AiMessage key={m.id} blocks={m.blocks} />
      )}
      {app.thinking && <ThinkingPill />}
      {app.streamText && <StreamingMessage text={app.streamText} />}
    </div>
  );
}
