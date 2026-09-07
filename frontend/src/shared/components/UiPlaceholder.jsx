import Logo from '@shared/icons/Logo.jsx';

/**
 * UiPlaceholder — stand-in shell for a UI style that has not been built yet.
 * Renders a legible message instead of a blank screen when CONFIG.uiStyle
 * points at a style whose screens are still stubs.
 */
export default function UiPlaceholder({ name }) {
  const mono = { fontFamily: "'Geist Mono', ui-monospace, monospace" };
  return (
    <div style={{
      height: '100vh', width: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      background: '#faf9f7', color: '#232320',
      fontFamily: "'Inter Tight', system-ui, sans-serif", textAlign: 'center', padding: 24,
    }}>
      <Logo size={40} />
      <div style={{ fontSize: 20, fontWeight: 600 }}>{name} UI — not built yet</div>
      <div style={{ fontSize: 14, color: '#8f8d86', maxWidth: 470, lineHeight: 1.6 }}>
        This style is a placeholder. Drop its screens into{' '}
        <code style={mono}>src/ui/{name.toLowerCase()}/</code> and it will render here.
        Set <code style={mono}>CONFIG.uiStyle</code> to <code style={mono}>'classic'</code>{' '}
        for the working prototype.
      </div>
    </div>
  );
}
