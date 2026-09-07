import Logo from '@shared/icons/Logo.jsx';
import { isDarkTheme } from '@shared/lib/theme.js';

/**
 * UiSwitching — what you see while another UI style's chunk is downloading.
 *
 * Switching style is a lazy import, so there is a real gap: the outgoing style unmounts, its
 * stylesheet unloads, and the incoming one has to be fetched. On a warm cache that is a frame
 * and nobody notices; on a cold one it is long enough that a blank screen reads as a crash.
 *
 * Two constraints shape this component, and both are why it looks the way it does:
 *
 *  1. **It cannot use any stylesheet.** During the gap neither style's CSS is loaded, so every
 *     value here is inline and literal. It cannot even use theme tokens — `applyTheme`'s cleanup
 *     has already stripped `data-theme` off the document.
 *  2. **It has to paint its own background.** With no stylesheet there is no `body` background,
 *     so it picks one from the theme's light/dark-ness. Getting this wrong means a white flash
 *     in the middle of a dark session, which is the exact thing the loader exists to prevent.
 *
 * The name of the destination is in the message on purpose. "Loading…" tells you nothing you
 * did not already know; "Preparing the Hybrid workspace" confirms the click registered and that
 * the thing arriving is the thing you asked for.
 */
export default function UiSwitching({ to, theme }) {
  const dark = isDarkTheme(theme);
  const bg = dark ? '#1a1a19' : '#faf9f7';
  const ink = dark ? '#f5f3ee' : '#232320';
  const dim = dark ? '#8b857c' : '#8f8d86';
  const track = dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 900,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 18, background: bg, color: ink,
        fontFamily: "'Inter Tight', system-ui, sans-serif",
        animation: 'uiSwitchIn .18s ease-out both',
      }}
    >
      {/* The keyframes live here rather than in a stylesheet for the same reason as everything
          else on this screen: there is no stylesheet to put them in. */}
      <style>{`
        @keyframes uiSwitchIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes uiSwitchPulse { 0%,100% { opacity: .45; transform: scale(.94) } 50% { opacity: 1; transform: scale(1) } }
        @keyframes uiSwitchBar { 0% { transform: translateX(-100%) } 100% { transform: translateX(320%) } }
        @media (prefers-reduced-motion: reduce) {
          [data-ui-switching] * { animation: none !important; }
        }
      `}</style>

      <div data-ui-switching style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <span style={{ color: ink, animation: 'uiSwitchPulse 1.5s ease-in-out infinite' }}>
          <Logo size={44} />
        </span>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-.01em' }}>
            Preparing the {to} workspace
          </div>
          <div style={{ fontSize: 13, color: dim, marginTop: 5 }}>
            Loading its layout and theme…
          </div>
        </div>

        {/* An indeterminate bar, not a percentage. We genuinely do not know how far along a
            dynamic import is, and a fake percentage that jumps to 100 is worse than none. */}
        <span style={{ width: 132, height: 3, borderRadius: 999, background: track, overflow: 'hidden' }}>
          <span style={{
            display: 'block', width: '30%', height: '100%', borderRadius: 999, background: ink,
            opacity: 0.5, animation: 'uiSwitchBar 1.1s ease-in-out infinite',
          }} />
        </span>
      </div>
    </div>
  );
}
