import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';

const POINTS = [
  { icon: 'sparkles', title: 'Ask in plain language', sub: 'Leave balances, attendance, who is out today.' },
  { icon: 'layoutGrid', title: 'Pin any answer', sub: 'Every tile re-runs its own question, so figures stay current.' },
  { icon: 'lock', title: 'Scoped to you', sub: 'Every request is checked against what you are allowed to see.' },
];

/**
 * Landing — the marketing gate, shown before sign-in.
 *
 * Rendered by the shell as a full-screen layer instead of a route, so the workspace behind it
 * never mounts for a signed-out visitor. Its three points are the actual product claims, which
 * is why they name the widget refresh and the permission scoping rather than adjectives.
 */
export default function Landing() {
  const app = useApp();
  return (
    <div className="neuiq-gate">
      <div style={{ maxWidth: 940, width: '100%', textAlign: 'center', padding: '40px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22, color: 'var(--accent)' }}>
          <Logo size={54} />
        </div>
        <h1 style={{ fontSize: 46, fontWeight: 700, letterSpacing: '-.03em', lineHeight: 1.08 }}>
          Your people data,<br />one question away.
        </h1>
        <p style={{ marginTop: 16, fontSize: 17, color: 'var(--ink-2)', maxWidth: 560, margin: '16px auto 0', lineHeight: 1.55 }}>
          NeuIQ is a conversational layer over Zoho People. Ask, get an answer from live records,
          and pin it to a dashboard that keeps itself up to date.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 30, flexWrap: 'wrap' }}>
          <button className="btn primary" onClick={() => app.enterAuth('signup')}>
            Get started<Icon name="arrowUp" size={16} style={{ transform: 'rotate(90deg)' }} />
          </button>
          <button className="btn ghost" onClick={() => app.enterAuth('login')}>Sign in</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))', gap: 16, marginTop: 54, textAlign: 'left' }}>
          {POINTS.map((p) => (
            <div className="card" key={p.title}>
              <span className="k-icon" style={{ marginBottom: 12 }}><Icon name={p.icon} size={16} /></span>
              <div style={{ fontSize: 15, fontWeight: 650 }}>{p.title}</div>
              <div style={{ fontSize: 13, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.5 }}>{p.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
