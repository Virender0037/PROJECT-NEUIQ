import Icon from '@shared/icons/Icon.jsx';
import { KIND_LABEL } from '@shared/data/emptyStates.js';

/**
 * An honest empty state, in Classic's chrome.
 *
 * Takes one entry from shared/data/emptyStates.js — the wording is shared with Hybrid, only the
 * look lives here. The kind badge ("Not connected", "No records"...) is visible on purpose: what
 * KIND of empty this is should not have to be inferred from the sentence.
 *
 * `compact` is the sidebar variant: one line, no icon tile.
 */
export default function EmptyPanel({ state, compact = false }) {
  if (compact) {
    return (
      <div role="status" data-empty-kind={state.kind}
        style={{ padding: '6px 10px', fontSize: 12.5, color: 'var(--text-subtle)', lineHeight: 1.45 }}>
        {state.title}. <span style={{ opacity: 0.85 }}>{state.body}</span>
      </div>
    );
  }
  return (
    <div role="status" data-empty-kind={state.kind}
      style={{ border: 'var(--border-w) dashed var(--border-strong)', background: 'var(--surface)', borderRadius: 14, padding: '34px 24px', textAlign: 'center' }}>
      <span style={{ width: 40, height: 40, borderRadius: 11, background: 'var(--surface-2)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
        <Icon name={state.icon} size={20} />
      </span>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{state.title}</div>
      <div style={{ fontSize: 13, color: 'var(--text-subtle)', maxWidth: 440, margin: '0 auto 12px', lineHeight: 1.5 }}>{state.body}</div>
      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-muted)', background: 'color-mix(in srgb,var(--text-muted) 14%,transparent)', borderRadius: 999, padding: '3px 10px' }}>
        {KIND_LABEL[state.kind]}
      </span>
    </div>
  );
}
