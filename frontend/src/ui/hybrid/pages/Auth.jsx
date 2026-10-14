import { useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import Logo from '@shared/icons/Logo.jsx';

const field = {
  width: '100%',
  height: 42,
  border: '1px solid var(--hairline)',
  background: 'var(--menu-bg)',
  borderRadius: 5,
  padding: '0 13px',
  fontSize: 14,
  color: 'var(--ink)',
  outline: 'none',
  fontFamily: 'inherit',
};

/**
 * Auth — sign in or create an account.
 *
 * A real <form> with a submit handler, not a click-handler on a button: that gets Enter-to-submit,
 * browser password managers and native validation for free. `autoComplete` is set per field and
 * switches between new-password and current-password, which is what tells a password manager
 * whether to offer a suggestion or a saved entry.
 *
 * Signs in against POST /auth/login. There is no password check — the demo identity layer is
 * labelled as one in backend middleware/index.js — but WHICH account you pick matters a great
 * deal, because every figure in the app is scoped to it. Signing in as an employee and as an HR
 * admin gives genuinely different answers to the same question, and that is the point of the
 * account picker below: it is the fastest way to see the scoping actually working.
 */
export default function Auth() {
  const app = useApp();
  const signup = app.authView === 'signup';
  const [email, setEmail] = useState('');

  /**
   * The username is the local part of the email.
   *
   * A demo you have to be told the usernames for is a demo nobody explores, so "alex@neuiq.com"
   * and "alex" both work. The picker below fills this in, which is why the field is controlled.
   */
  // What the backend's auth mode allows (shared/lib/authMode.js): the form and the picker are
  // demo-only, and exist on screen only when the backend explicitly said 'demo'.
  const opts = app.signInOptions;
  const submit = (e) => {
    e.preventDefault();
    if (opts.allowDemo) app.doAuth(email.split('@')[0] || 'alex');
  };

  return (
    <div className="neuiq-gate">
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 26 }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, color: 'var(--accent)' }}>
            <Logo size={38} />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.02em' }}>
            {signup ? 'Create your account' : 'Welcome back'}
          </h1>
          <p style={{ marginTop: 5, fontSize: 14, color: 'var(--ink-2)' }}>
            {signup ? 'Start asking your people data questions.' : 'Sign in to continue.'}
          </p>
        </div>

        {/* Demo sign-in — this form, the picker and the signup toggle — exists only when the
            backend explicitly reported demo mode. Otherwise the screen offers nothing it cannot
            honour. */}
        {!opts.allowDemo && (
          <div className="card" role="status" style={{ textAlign: 'center', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            {opts.message}
          </div>
        )}
        {opts.allowDemo && (
        <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {signup && (
            <label style={{ display: 'block' }}>
              <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Full name</span>
              <input style={field} type="text" placeholder="Your name" autoComplete="name" />
            </label>
          )}
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Work email</span>
            <input
              style={field}
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
            />
          </label>
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Password</span>
            <input style={field} type="password" placeholder="••••••••" autoComplete={signup ? 'new-password' : 'current-password'} />
          </label>

          {/* The server's own words. A sign-in failure the UI paraphrases is a sign-in failure
              nobody can debug. */}
          {app.authError && (
            <div className="adb-error" role="alert" style={{ margin: 0 }}>{app.authError}</div>
          )}

          <button
            className="btn primary"
            type="submit"
            disabled={app.authBusy}
            style={{ justifyContent: 'center', marginTop: 4 }}
          >
            {app.authBusy && <span className="btn-spin" />}
            {app.authBusy ? 'Signing in…' : signup ? 'Create account' : 'Sign in'}
          </button>

        </form>
        )}
        {/* Zoho sign-in is not built yet, so the control is disabled and says so — never a fake
            success. It used to sit inside the demo form and toast "Coming soon". */}
        {opts.showZoho && (
          <button
            type="button"
            className="btn ghost"
            disabled={!opts.zoho.enabled}
            aria-disabled={!opts.zoho.enabled}
            title={opts.zoho.note || undefined}
            style={{ justifyContent: 'center', width: '100%', marginTop: 12, opacity: opts.zoho.enabled ? 1 : 0.7, cursor: opts.zoho.enabled ? 'pointer' : 'not-allowed' }}
          >
            <Icon name="user" size={16} />{opts.zoho.label}
            {opts.zoho.note && <span className="chip" style={{ marginLeft: 6 }}>{opts.zoho.note}</span>}
          </button>
        )}

        {/* Demo mode only, and only once the API answered with accounts — an empty picker would
            read as a loading bug. */}
        {opts.allowDemo && app.demoUsers.length > 0 && (
          <div className="card" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 650, color: 'var(--ink-2)', marginBottom: 9 }}>
              Demo accounts — each sees different data
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {app.demoUsers.map((u) => (
                <button
                  type="button"
                  key={u.username}
                  className="neuiq-row"
                  onClick={() => { setEmail(u.username); app.doAuth(u.username); }}
                  disabled={app.authBusy}
                >
                  <Icon name="user" size={15} />
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>{u.name}</span>
                  <span className="chip">{u.role.replace('_', ' ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {opts.allowDemo && (
          <div style={{ textAlign: 'center', marginTop: 18, fontSize: 13.5, color: 'var(--ink-2)' }}>
            {signup ? 'Already have an account?' : 'No account yet?'}{' '}
            <button
              onClick={app.toggleAuthView}
              style={{ border: 'none', background: 'none', color: 'var(--accent)', cursor: 'pointer', fontWeight: 650, fontSize: 13.5, fontFamily: 'inherit' }}
            >
              {signup ? 'Sign in' : 'Create one'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
