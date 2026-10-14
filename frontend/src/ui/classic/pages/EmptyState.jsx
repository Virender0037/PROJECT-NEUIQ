import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';
import { promptsFor } from '@shared/data/hrPrompts.js';

/**
 * EmptyState — a new chat with nothing in it yet.
 *
 * Not a separate route: the shell shows this when `messages.length === 0`, so typing does not
 * navigate anywhere.
 *
 * The cards are example HR questions this caller's role can actually ask (shared/data/hrPrompts.js)
 * — they replaced generic prompts ("Write a React hook") that NeuIQ cannot answer. Picking one
 * only fills the composer; the answer still comes from the backend.
 */
export default function EmptyState() {
  const app = useApp();
  const prompts = promptsFor(app.user);
  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '0 24px', minHeight: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, color: 'var(--text)', animation: 'nrPop .4s ease-out' }}>
        <Logo size={56} stroke={1.4} />
      </div>
      <h1 style={{ fontFamily: 'Geist', fontSize: 32, fontWeight: 600, letterSpacing: '-.025em', margin: '0 0 8px', color: 'var(--text)' }}>{app.greeting}</h1>
      <p style={{ fontSize: 15.5, color: 'var(--text-subtle)', margin: '0 0 30px' }}>Ask about leave, attendance or your team.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, width: '100%', maxWidth: 560 }} aria-label="Example questions">
        {prompts.map((s) => (
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
