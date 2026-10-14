import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';
import { promptsFor } from '@shared/data/hrPrompts.js';

/**
 * EmptyState — a new chat with nothing in it yet.
 *
 * Not a separate route: the shell shows this when `messages.length === 0`, so starting to type
 * does not navigate anywhere. Suggestion cards hide behind a preference, because on a second
 * visit they are clutter rather than help.
 *
 * The cards are example HR questions this caller's role can actually ask (shared/data/hrPrompts.js)
 * — they replaced generic prompts NeuIQ cannot answer. The subtitle no longer claims "live Zoho
 * People data": the backend may be serving demo data, and saying which is the data-source
 * indicator's job, not this sentence's.
 */
export default function EmptyState() {
  const app = useApp();
  const prompts = promptsFor(app.user);
  return (
    <div className="view neuiq-chat" style={{ paddingTop: 40 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--accent)' }}>
          <Logo size={38} />
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em' }}>{app.greeting}</h1>
        <p style={{ marginTop: 6, color: 'var(--ink-2)', fontSize: 15 }}>
          Ask about leave, attendance or your team.
        </p>
      </div>
      {app.prefs.suggestions && (
        <div className="neuiq-suggest" aria-label="Example questions">
          {prompts.map(s => (
            <button key={s.title} onClick={() => app.pickSuggestion(s.prompt)}>
              <span className="k-icon"><Icon name={s.icon} size={16} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 650 }}>{s.title}</span>
                <span style={{ display: 'block', fontSize: 12.5, color: 'var(--ink-dim)', marginTop: 2 }}>{s.sub}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
