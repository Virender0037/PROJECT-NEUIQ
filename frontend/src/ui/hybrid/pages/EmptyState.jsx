import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';
import { SUGGESTIONS } from '@shared/data/mockData.js';

/**
 * EmptyState — a new chat with nothing in it yet.
 *
 * Not a separate route: the shell shows this when `messages.length === 0`, so starting to type
 * does not navigate anywhere. Suggestion cards hide behind a preference, because on a second
 * visit they are clutter rather than help.
 */
export default function EmptyState() {
  const app = useApp();
  return (
    <div className="view neuiq-chat" style={{ paddingTop: 40 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, color: 'var(--accent)' }}>
          <Logo size={38} />
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-.025em' }}>{app.greeting}</h1>
        <p style={{ marginTop: 6, color: 'var(--ink-2)', fontSize: 15 }}>
          Ask about leave, attendance or your team — answers come from live Zoho People data.
        </p>
      </div>
      {app.prefs.suggestions && (
        <div className="neuiq-suggest">
          {SUGGESTIONS.map(s => (
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
