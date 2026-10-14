import { useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';

const INPUT = "height:42px;padding:0 13px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text);border-radius:10px;font-size:14px;font-family:'Inter Tight';outline:none";
const FOCUS = 'border-color:var(--accent);box-shadow:0 0 0 3px var(--ring)';

/**
 * Auth — sign in or create an account.
 *
 * Signs in against POST /auth/login. No password is checked — the demo identity layer is
 * labelled as one in backend middleware/index.js — but WHICH account you pick decides every
 * figure in the app, because all of them are scoped to the caller. The demo picker exists for
 * that reason: signing in as an employee and then as an HR admin is the quickest way to see the
 * scoping actually working.
 */
export default function Auth() {
  const app = useApp();
  const isSignup = app.authView === 'signup';
  const [email, setEmail] = useState('');
  // What the backend's auth mode allows (shared/lib/authMode.js): the form and the picker are
  // demo-only, and exist on screen only when the backend explicitly said 'demo'.
  const opts = app.signInOptions;
  /** The username is the local part of the email, so "alex@neuiq.com" and "alex" both work. */
  const signIn = () => { if (opts.allowDemo) app.doAuth(email.split('@')[0] || 'alex'); };
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

          {/* Demo sign-in — the username form, the picker and the signup toggle — exists only when
              the backend explicitly reported demo mode (shared/lib/authMode.js). Otherwise the
              screen offers nothing it cannot honour. */}
          {opts.allowDemo ? (
            <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {isSignup && (
                <Field label="Full name">
                  <El as="input" type="text" placeholder="Your name" css={INPUT} focus={FOCUS} />
                </Field>
              )}
              <Field label="Email">
                <El
                  as="input"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') signIn(); }}
                  placeholder="you@company.com"
                  css={INPUT}
                  focus={FOCUS}
                />
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
              {/* The server's own words. A sign-in failure the UI paraphrases is one nobody can
                  debug. */}
              {app.authError && (
                <div role="alert" style={{ fontSize: 12.5, color: 'var(--red, var(--text))', lineHeight: 1.45 }}>
                  {app.authError}
                </div>
              )}
              <El as="button" onClick={signIn} disabled={app.authBusy}
                css="height:44px;margin-top:4px;border:none;background:var(--accent);color:var(--accent-fg);border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;font-family:'Inter Tight';transition:filter .12s,transform .08s"
                hover="filter:brightness(1.06)" active="transform:translateY(.5px)">{app.authBusy ? 'Signing in…' : cta}</El>
            </div>
            </>
          ) : (
            <div role="status" style={{ fontSize: 13.5, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
              {opts.message}
            </div>
          )}

          {opts.showZoho && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>{opts.allowDemo ? 'or' : 'sign in'}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {/* This used to read "Continue with SSO" and quietly ran the DEMO sign-in. Zoho sign-in
                  is not built yet, so the control is disabled and says so — never a fake success. */}
              <El as="button" disabled={!opts.zoho.enabled} aria-disabled={!opts.zoho.enabled}
                title={opts.zoho.note || undefined}
                css="width:100%;height:44px;display:flex;align-items:center;justify-content:center;gap:9px;border:var(--border-w) solid var(--border-strong);background:var(--surface);color:var(--text-subtle);border-radius:10px;font-size:14px;font-weight:500;cursor:not-allowed;font-family:'Inter Tight';opacity:.75">
                <Icon name="lock" size={18} />{opts.zoho.label}{opts.zoho.note && <span style={{ fontSize: 12, fontWeight: 600 }}>· {opts.zoho.note}</span>}
              </El>
            </>
          )}

          {/* Demo mode only, and only once the API answered with accounts — an empty picker would
              read as a loading bug. */}
          {opts.allowDemo && app.demoUsers.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-subtle)', marginBottom: 8 }}>
                Demo accounts — each sees different data
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {app.demoUsers.map((u) => (
                  <El
                    as="button"
                    key={u.username}
                    onClick={() => { setEmail(u.username); app.doAuth(u.username); }}
                    disabled={app.authBusy}
                    css="height:38px;display:flex;align-items:center;gap:9px;padding:0 12px;border:var(--border-w) solid var(--border);background:var(--surface);color:var(--text);border-radius:9px;font-size:13px;cursor:pointer;font-family:'Inter Tight';transition:background .12s;text-align:left"
                    hover="background:var(--hover)"
                  >
                    <Icon name="user" size={15} />
                    <span style={{ flex: 1, minWidth: 0 }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{u.role.replace('_', ' ')}</span>
                  </El>
                ))}
              </div>
            </div>
          )}

          {opts.allowDemo && (
            <div style={{ textAlign: 'center', marginTop: 22, fontSize: 13, color: 'var(--text-subtle)' }}>
              <El as="button" onClick={app.toggleAuthView}
                css="border:none;background:none;color:var(--text);font-weight:600;cursor:pointer;font-family:'Inter Tight';font-size:13px"
                hover="text-decoration:underline">{toggle}</El>
            </div>
          )}
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
