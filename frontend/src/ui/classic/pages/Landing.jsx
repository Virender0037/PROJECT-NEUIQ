import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';

const NAV = ['Product', 'Features', 'Pricing', 'Docs'];
const FEATURES = [
  { icon: 'sparkles', title: 'Context that carries', body: 'Projects keep the full picture across every chat, so NeuIQ always knows what you are working on.' },
  { icon: 'layoutGrid', title: 'Work, organized', body: 'Dashboards, tasks, and files live together in one focused, distraction-free space.' },
  { icon: 'lock', title: 'Private by default', body: 'Incognito chats stay off your history. You decide exactly what gets saved.' },
];

/** Marketing hero shown before sign-in. */
export default function Landing() {
  const app = useApp();
  const navLink = (label) => (
    <El key={label} as="button" onClick={app.toast}
      css="border:none;background:none;color:var(--text-muted);font-size:14px;cursor:pointer;font-family:'Inter Tight';font-weight:500"
      hover="color:var(--text)">{label}</El>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 110, background: 'var(--app-bg)', color: 'var(--text)', overflow: 'auto', fontFamily: "'Inter Tight'" }}>
      {/* top nav */}
      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <span style={{ color: 'var(--text)', display: 'flex' }}><Logo size={26} /></span>
          <span style={{ fontFamily: 'Geist', fontWeight: 700, fontSize: 18, letterSpacing: '-.02em' }}>NeuIQ</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>{NAV.map(navLink)}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <El as="button" onClick={app.cycleTheme} title="Switch theme"
            css="width:36px;height:36px;border:var(--border-w) solid var(--border);background:var(--elevated);color:var(--text-muted);border-radius:999px;cursor:pointer;display:flex;align-items:center;justify-content:center"
            hover="background:var(--hover);color:var(--text)"><Icon name={app.theme === 'dark' ? 'moon' : 'sun'} size={18} /></El>
          <El as="button" onClick={() => app.enterAuth('login')}
            css="height:36px;padding:0 12px;border:none;background:transparent;color:var(--text);border-radius:9px;font-size:14px;font-weight:500;cursor:pointer;font-family:'Inter Tight'"
            hover="background:var(--hover)">Sign in</El>
          <El as="button" onClick={() => app.enterAuth('signup')}
            css="height:36px;padding:0 15px;border:var(--border-w) solid var(--border-strong);background:var(--accent);color:var(--accent-fg);border-radius:9px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter Tight';transition:filter .12s"
            hover="filter:brightness(1.08)">Get started</El>
        </div>
      </div>

      {/* hero */}
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '64px 24px 44px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, height: 30, padding: '0 13px', border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 999, fontSize: 12.5, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 26 }}>
          <Icon name="sparkles" size={14} />Introducing NeuIQ
        </div>
        <h1 style={{ fontFamily: 'Geist', fontSize: 'clamp(34px,5.6vw,58px)', lineHeight: 1.05, fontWeight: 600, letterSpacing: '-.03em', margin: '0 0 20px', color: 'var(--text)', textWrap: 'balance' }}>Think, build, and ship — with one AI workspace.</h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: 'var(--text-subtle)', maxWidth: 560, margin: '0 auto 30px', textWrap: 'pretty' }}>NeuIQ brings your chats, projects, and tasks into one calm space, so you can move from idea to output without switching tools.</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <El as="button" onClick={() => app.enterAuth('signup')}
            css="height:46px;padding:0 22px;border:var(--border-w) solid var(--border-strong);background:var(--accent);color:var(--accent-fg);border-radius:11px;font-size:15px;font-weight:600;cursor:pointer;font-family:'Inter Tight';transition:filter .12s,transform .08s"
            hover="filter:brightness(1.08)" active="transform:translateY(.5px)">Get started free</El>
          <El as="button" onClick={() => app.enterAuth('login')}
            css="height:46px;padding:0 20px;border:var(--border-w) solid var(--border-strong);background:transparent;color:var(--text);border-radius:11px;font-size:15px;font-weight:500;cursor:pointer;font-family:'Inter Tight';transition:background .12s"
            hover="background:var(--hover)">Sign in</El>
        </div>
      </div>

      {/* product preview */}
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px 64px' }}>
        <div style={{ border: 'var(--border-w) solid var(--border-strong)', borderRadius: 16, overflow: 'hidden', background: 'var(--surface)', boxShadow: 'var(--sh-lg)' }}>
          <div style={{ height: 34, display: 'flex', alignItems: 'center', gap: 7, padding: '0 14px', borderBottom: 'var(--border-w) solid var(--border)' }}>
            {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--border-strong)' }} />)}
          </div>
          <div style={{ aspectRatio: '16/9', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'repeating-linear-gradient(135deg,var(--surface),var(--surface) 11px,var(--surface-2) 11px,var(--surface-2) 22px)' }}>
            <span style={{ fontFamily: 'Geist Mono', fontSize: 12, color: 'var(--text-subtle)', letterSpacing: '.04em' }}>product preview</span>
          </div>
        </div>
      </div>

      {/* features */}
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 24px 64px', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
        {FEATURES.map((f) => (
          <div key={f.title} style={{ border: 'var(--border-w) solid var(--border)', background: 'var(--surface)', borderRadius: 14, padding: 22 }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--chip)', color: 'var(--chip-fg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}><Icon name={f.icon} size={18} /></span>
            <div style={{ fontFamily: 'Geist', fontSize: 16, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>{f.title}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-subtle)' }}>{f.body}</div>
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ borderTop: 'var(--border-w) solid var(--border)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '22px 24px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, color: 'var(--text-subtle)' }}>
            <span style={{ color: 'var(--text-subtle)', display: 'flex' }}><Logo size={26} /></span>
            <span style={{ fontSize: 13 }}>© 2026 NeuIQ</span>
          </div>
          <div style={{ display: 'flex', gap: 18 }}>
            {['Terms', 'Privacy', 'Contact'].map((l) => (
              <El key={l} as="button" onClick={app.toast}
                css="border:none;background:none;color:var(--text-muted);cursor:pointer;font-family:'Inter Tight';font-weight:500;font-size:13px"
                hover="color:var(--text)">{l}</El>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
