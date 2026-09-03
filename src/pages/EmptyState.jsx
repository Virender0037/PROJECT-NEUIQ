import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import Logo from '../icons/Logo.jsx';
import { SUGGESTIONS } from '../data/mockData.js';

/** Screen 1 — centered greeting + 2×2 suggested-prompt cards. */
export default function EmptyState() {
  const app = useApp();
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: 'var(--text)', animation: 'nrPop .4s ease-out' }}>
        <Logo size={56} stroke={1.4} />
      </div>
      <h1 style={{ fontFamily: 'Geist', fontSize: 32, fontWeight: 600, letterSpacing: '-.025em', margin: '0 0 8px', color: 'var(--text)' }}>{app.greeting}</h1>
      <p style={{ fontSize: 15.5, color: 'var(--text-subtle)', margin: '0 0 30px' }}>How can I help you today?</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 560 }}>
        {SUGGESTIONS.map((s) => (
          <El key={s.title} as="button" onClick={() => app.pickSuggestion(s.prompt)}
            css="display:flex;align-items:flex-start;gap:12px;text-align:left;padding:16px;border:var(--border-w) solid var(--border);background:var(--surface);border-radius:13px;cursor:pointer;transition:background .12s,border-color .12s,transform .08s"
            hover="background:var(--hover);border-color:var(--border-strong)" active="transform:translateY(.5px)">
            <span style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><Icon name={s.icon} size={18} /></span>
            <span>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{s.title}</span>
              <span style={{ display: 'block', fontSize: 12.5, color: 'var(--text-subtle)', lineHeight: 1.4 }}>{s.sub}</span>
            </span>
          </El>
        ))}
      </div>
    </div>
  );
}
