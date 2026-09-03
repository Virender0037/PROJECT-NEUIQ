import { useApp } from '../context/AppContext.jsx';
import El from '../components/El.jsx';
import Icon from '../icons/Icon.jsx';
import Logo from '../icons/Logo.jsx';

const INPUT = "height:42px;padding:0 13px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:10px;font-size:14px;font-family:'Inter Tight';outline:none";
const FOCUS = 'border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)';

/** Screen 9 — login / signup, matching the active theme + logo. */
export default function Auth() {
  const app = useApp();
  const isSignup = app.authView === 'signup';
  const title = isSignup ? 'Create your account' : 'Welcome back';
  const sub = isSignup ? 'Start building with NeuIQ' : 'Sign in to continue to NeuIQ';
  const cta = isSignup ? 'Create account' : 'Sign in';
  const toggle = isSignup ? 'Already have an account? Sign in' : 'New here? Create an account';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--app-bg)', color: 'var(--text)', display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
      <div style={{ position: 'absolute', top: 16, right: 18, zIndex: 2 }}>
        <El as="button" onClick={app.cycleTheme} title="Switch theme"
          css="width:36px;height:36px;border:var(--border-w) solid var(--border);background:var(--elevated);color:var(--text-muted);border-radius:999px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:color .12s,background .12s"
          hover="background:var(--hover);color:var(--text)"><Icon name={app.theme === 'dark' ? 'moon' : 'sun'} size={18} /></El>
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 380, animation: 'nrPop .4s ease-out' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 26 }}>
            <div style={{ color: 'var(--text)', marginBottom: 16 }}><Logo size={46} stroke={1.35} /></div>
            <h1 style={{ fontFamily: 'Geist', fontSize: 24, fontWeight: 600, letterSpacing: '-.02em', margin: '0 0 6px', color: 'var(--text)' }}>{title}</h1>
            <p style={{ fontSize: 14, color: 'var(--text-subtle)', margin: 0 }}>{sub}</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {isSignup && (
              <Field label="Full name">
                <El as="input" type="text" placeholder="Alex Morgan" css={INPUT} focus={FOCUS} />
              </Field>
            )}
            <Field label="Email">
              <El as="input" type="email" placeholder="you@company.com" css={INPUT} focus={FOCUS} />
            </Field>
            <Field label="Password">
              <El as="input" type="password" placeholder="Enter your password" css={INPUT} focus={FOCUS} />
            </Field>
            {!isSignup && (
              <div style={{ textAlign: 'right', marginTop: -4 }}>
                <El as="button" onClick={app.toast}
                  css="border:none;background:none;color:var(--text-muted);font-size:12.5px;cursor:pointer;font-family:'Inter Tight'"
                  hover="color:var(--text)">Forgot password?</El>
              </div>
            )}
            <El as="button" onClick={app.doAuth}
              css="height:44px;margin-top:4px;border:none;background:var(--accent);color:var(--accent-fg);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter Tight';transition:filter .12s,transform .08s"
              hover="filter:brightness(1.06)" active="transform:translateY(.5px)">{cta}</El>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>or</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          <El as="button" onClick={app.doAuth}
            css="width:100%;height:44px;display:flex;align-items:center;justify-content:center;gap:9px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:10px;font-size:14px;font-weight:500;cursor:pointer;font-family:'Inter Tight';transition:background .12s"
            hover="background:var(--hover)"><Icon name="lock" size={18} />Continue with SSO</El>

          <div style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--text-subtle)' }}>
            <El as="button" onClick={app.toggleAuthView}
              css="border:none;background:none;color:var(--text);font-weight:600;cursor:pointer;font-family:'Inter Tight';font-size:13px"
              hover="text-decoration:underline">{toggle}</El>
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center', padding: 18, fontSize: 12, color: 'var(--text-subtle)' }}>By continuing you agree to our Terms and Privacy Policy.</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  );
}
