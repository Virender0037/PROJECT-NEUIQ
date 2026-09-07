import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';

/**
 * ChatMessage — the four ways a turn can appear: user bubble, settled assistant reply,
 * thinking pill, and mid-stream reply.
 *
 * Assistant replies are structured BLOCKS, not markdown strings. `Block` renders one of
 * p/h3/ul/ol/code/table, and anything unrecognised renders nothing rather than raw text — a
 * block type this build does not know is a newer server, not something to dump on the page.
 *
 * The streaming variant is separate from the settled one because it re-renders on every tick;
 * keeping it apart means a long finished conversation is not re-reconciled 60 times a second.
 */
export function AiAvatar() {
  return (
    <div className="chat-ava" style={{ width: 30, height: 30, borderRadius: 5, marginTop: 2 }}>
      <Logo size={17} stroke={1.6} />
    </div>
  );
}

export function UserMessage({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{
        maxWidth: '78%', background: 'var(--hairline-2)', border: '1px solid var(--hairline)',
        borderRadius: '6px 6px 4px 6px', padding: '11px 15px', fontSize: 14.5, lineHeight: 1.55,
        color: 'var(--ink)', whiteSpace: 'pre-wrap',
      }}>{text}</div>
    </div>
  );
}

function Block({ b }) {
  const app = useApp();
  if (b.t === 'p') return <p style={{ margin: '0 0 14px' }}>{b.text}</p>;
  if (b.t === 'h3') return <h3 style={{ fontSize: 16.5, fontWeight: 700, margin: '20px 0 10px', letterSpacing: '-.015em' }}>{b.text}</h3>;
  if (b.t === 'ul') return <ul style={{ margin: '0 0 14px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{b.items.map((li, i) => <li key={i} style={{ lineHeight: 1.55 }}>{li}</li>)}</ul>;
  if (b.t === 'ol') return <ol style={{ margin: '0 0 14px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>{b.items.map((li, i) => <li key={i} style={{ lineHeight: 1.55 }}>{li}</li>)}</ol>;
  if (b.t === 'code') return (
    <div style={{ margin: '0 0 14px', border: '1px solid var(--hairline)', borderRadius: 6, overflow: 'hidden', background: 'var(--hairline-2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--hairline)', fontSize: 11.5, color: 'var(--ink-dim)' }}>
        <span>{b.lang}</span>
        <button onClick={app.toast} style={{ border: 'none', background: 'transparent', color: 'var(--ink-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontFamily: 'inherit' }}>
          <Icon name="copy" size={14} />Copy
        </button>
      </div>
      <pre style={{ margin: 0, padding: 14, overflowX: 'auto', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)' }}>{b.code}</pre>
    </div>
  );
  if (b.t === 'table') return (
    <div style={{ margin: '0 0 14px', border: '1px solid var(--hairline)', borderRadius: 6, overflowX: 'auto' }}>
      <table style={{ width: '100%', minWidth: 0, borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr>{b.head.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '10px 14px', background: 'var(--hairline-2)', borderBottom: '1px solid var(--hairline)', fontWeight: 650 }}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i} style={{ borderTop: '1px solid var(--hairline)' }}>{r.cells.map((c, j) => <td key={j} style={{ padding: '10px 14px', color: 'var(--ink-2)' }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  return null;
}

/**
 * Where an answer came from, under the answer.
 *
 * This is not decoration. Every figure in this product is somebody's leave or hours, and the
 * first question anyone asks of such a number is "is that actually from Zoho?". The tool name
 * answers it, and `sample` answers it in the other direction — that this one is not.
 */
export function AnswerMeta({ meta }) {
  if (!meta) return null;
  const bits = [];
  if (meta.tool) bits.push(meta.tool);
  if (meta.source && meta.source !== 'sample' && meta.source !== 'guard') bits.push('routed by ' + meta.source);
  if (meta.outcome === 'refused') bits.push('refused');
  if (meta.outcome === 'stopped') bits.push('stopped');
  if (!bits.length && meta.source !== 'sample') return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -6, marginBottom: 10, fontSize: 11.5, color: 'var(--ink-dim)' }}>
      {meta.source === 'sample' && <span className="dw-tag">sample</span>}
      {bits.length > 0 && <code style={{ fontSize: 11.5 }}>{bits.join(' · ')}</code>}
    </div>
  );
}

export function AiMessage({ blocks, meta }) {
  const app = useApp();
  const act = (icon, title, onClick = app.toast) => (
    <button onClick={onClick} title={title} aria-label={title}
      style={{ width: 30, height: 30, border: 'none', background: 'transparent', color: 'var(--ink-dim)', borderRadius: 5, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={16} />
    </button>
  );
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <AiAvatar />
      <div style={{ minWidth: 0, flex: 1, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)' }}>
        {blocks.map((b, i) => <Block key={i} b={b} />)}
        <AnswerMeta meta={meta} />
        <div style={{ display: 'flex', gap: 2, marginTop: -4, alignItems: 'center' }}>
          {act('copy', 'Copy')}{act('refresh', 'Regenerate')}
          {act('thumbsUp', 'Good response')}{act('thumbsDown', 'Bad response')}
          {act('share', 'Share')}
          {/* Only shown when the backend said this question has a chartable equivalent. The
              orchestrator already knows which tool answered, so the spec comes free — see
              PINNABLE in backend orchestrator/index.js. */}
          {meta?.pinnable && (
            <button
              className="btn ghost"
              style={{ height: 26, padding: '0 9px', fontSize: 12, marginLeft: 6 }}
              onClick={() => app.pinAnswer(meta.pinnable)}
            >
              <Icon name="bookmark" size={13} />Pin as widget
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThinkingPill() {
  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
      <AiAvatar />
      <span className="chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles" size={14} />Thinking…
      </span>
    </div>
  );
}

export function StreamingMessage({ text }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <AiAvatar />
      <div style={{ minWidth: 0, flex: 1, fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink)' }}>
        <p style={{ margin: 0 }}>
          {text}
          <span style={{ display: 'inline-block', width: 2, height: '1em', background: 'var(--accent)', marginLeft: 2, verticalAlign: 'text-bottom', animation: 'blink 1s step-end infinite' }} />
        </p>
      </div>
    </div>
  );
}
