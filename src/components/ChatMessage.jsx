import { useApp } from '../context/AppContext.jsx';
import El from './El.jsx';
import Icon from '../icons/Icon.jsx';
import Logo from '../icons/Logo.jsx';

/** Small accent avatar shown beside every assistant message. */
export function AiAvatar() {
  return (
    <div style={{ width: 30, height: 30, flex: '0 0 auto', borderRadius: 9, background: 'var(--surface)', border: 'var(--border-w) solid var(--border)', color: 'var(--text)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2, boxShadow: 'var(--sh-xs)' }}>
      <Logo size={18} stroke={1.5} />
    </div>
  );
}

export function UserMessage({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'nrIn .32s ease-out' }}>
      <div style={{ maxWidth: '80%', background: 'var(--user-bubble)', border: 'var(--border-w) solid var(--border)', borderRadius: '16px 16px 4px 16px', padding: '11px 15px', fontSize: 15, lineHeight: 1.55, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>{text}</div>
    </div>
  );
}

function Block({ b }) {
  const app = useApp();
  if (b.t === 'p') return <p style={{ margin: '0 0 14px' }}>{b.text}</p>;
  if (b.t === 'h3') return <h3 style={{ fontFamily: 'Geist', fontSize: 17, fontWeight: 600, margin: '20px 0 10px', letterSpacing: '-.01em' }}>{b.text}</h3>;
  if (b.t === 'ul') return <ul style={{ margin: '0 0 14px', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>{b.items.map((li, i) => <li key={i} style={{ lineHeight: 1.55 }}>{li}</li>)}</ul>;
  if (b.t === 'ol') return <ol style={{ margin: '0 0 14px', paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>{b.items.map((li, i) => <li key={i} style={{ lineHeight: 1.55 }}>{li}</li>)}</ol>;
  if (b.t === 'code') return (
    <div style={{ margin: '0 0 14px', border: 'var(--border-w) solid var(--border)', borderRadius: 11, overflow: 'hidden', background: 'var(--code-bg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: 'var(--border-w) solid var(--border)', fontFamily: 'Geist Mono', fontSize: 11.5, color: 'var(--text-subtle)' }}>
        <span>{b.lang}</span>
        <El as="button" onClick={app.toast}
          css="border:none;background:transparent;color:var(--text-subtle);cursor:pointer;display:flex;align-items:center;gap:5px;font-family:'Inter Tight';font-size:12px"
          hover="color:var(--text)"><Icon name="copy" size={14} /><span>Copy</span></El>
      </div>
      <pre style={{ margin: 0, padding: 14, overflowX: 'auto', fontFamily: 'Geist Mono', fontSize: 13, lineHeight: 1.6, color: 'var(--text)' }}>{b.code}</pre>
    </div>
  );
  if (b.t === 'table') return (
    <div style={{ margin: '0 0 14px', border: 'var(--border-w) solid var(--border)', borderRadius: 11, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead><tr>{b.head.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '10px 14px', background: 'var(--surface)', borderBottom: 'var(--border-w) solid var(--border)', fontWeight: 600, color: 'var(--text)' }}>{h}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, i) => <tr key={i} style={{ borderTop: 'var(--border-w) solid var(--border)' }}>{r.cells.map((c, j) => <td key={j} style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
  return null;
}

export function AiMessage({ blocks }) {
  const app = useApp();
  const action = (icon, title, hoverColor) => (
    <El as="button" onClick={app.toast} title={title}
      css="width:30px;height:30px;border:none;background:transparent;color:var(--text-subtle);border-radius:7px;cursor:pointer;display:flex;align-items:center;justify-content:center"
      hover={`background:var(--hover);color:${hoverColor}`}><Icon name={icon} size={16} /></El>
  );
  return (
    <div style={{ display: 'flex', gap: 14, animation: 'nrIn .32s ease-out' }}>
      <AiAvatar />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15.5, lineHeight: 1.68, color: 'var(--text)' }}>
          {blocks.map((b, i) => <Block key={i} b={b} />)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginTop: 4 }}>
          {action('copy', 'Copy', 'var(--text)')}
          {action('refresh', 'Regenerate', 'var(--text)')}
          {action('thumbsUp', 'Like', 'var(--green)')}
          {action('thumbsDown', 'Dislike', 'var(--red)')}
          {action('bookmark', 'Save', 'var(--text)')}
        </div>
      </div>
    </div>
  );
}

export function ThinkingPill() {
  return (
    <div style={{ display: 'flex', gap: 14, animation: 'nrIn .3s ease-out' }}>
      <AiAvatar />
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, height: 30, padding: '0 14px', background: 'var(--surface)', border: 'var(--border-w) solid var(--border)', borderRadius: 999 }}>
        <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Analyzing</span>
        <span style={{ display: 'flex', gap: 4 }}>
          {[0, 0.2, 0.4].map((d, i) => (
            <span key={i} style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--accent)', animation: `nrPulse 1.2s infinite ${d}s` }} />
          ))}
        </span>
      </div>
    </div>
  );
}

export function StreamingMessage({ text }) {
  return (
    <div style={{ display: 'flex', gap: 14 }}>
      <AiAvatar />
      <div style={{ flex: 1, fontSize: 15.5, lineHeight: 1.68, color: 'var(--text)' }}>
        {text}
        <span style={{ display: 'inline-block', width: 8, height: 17, transform: 'translateY(2px)', marginLeft: 1, background: 'var(--accent)', borderRadius: 1, animation: 'nrBlink 1s steps(1) infinite' }} />
      </div>
    </div>
  );
}
