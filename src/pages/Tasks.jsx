import { useState } from 'react';
import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import { TASKS } from '../data/mockData.js';

/** Tasks — checklist with toggleable completion and category tags. */
export default function Tasks() {
  const app = useApp();
  const [tasks, setTasks] = useState(TASKS);
  const toggle = (i) => setTasks((t) => t.map((x, j) => (j === i ? { ...x, done: !x.done } : x)));

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '6px 26px 40px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ fontFamily: 'Geist', fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: 0 }}>Tasks</h1>
        <El as="button" onClick={app.toast}
          css="display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:9px;cursor:pointer;font-size:13px;font-weight:500;font-family:'Inter Tight'"
          hover="background:var(--hover)"><Icon name="plus" size={16} />New task</El>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {tasks.map((t, i) => (
          <div key={t.title} style={{ display: 'flex', alignItems: 'center', gap: 13, border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 12, padding: '14px 16px' }}>
            <El as="button" onClick={() => toggle(i)}
              css={`width:22px;height:22px;flex:0 0 auto;border-radius:7px;border:2px solid ${t.done ? 'var(--accent)' : 'var(--border-strong)'};background:${t.done ? 'var(--accent)' : 'transparent'};color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0`}
              hover="border-color:var(--accent)">{t.done && <Icon name="check" size={14} />}</El>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: t.done ? 'var(--text-subtle)' : 'var(--text)', textDecoration: t.done ? 'line-through' : 'none' }}>{t.title}</div>
              <div style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{t.due}</div>
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'color-mix(in srgb,var(--text-muted) 14%,transparent)', borderRadius: 999, padding: '3px 10px' }}>{t.tag}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
