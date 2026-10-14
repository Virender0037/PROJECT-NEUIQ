import Icon from '@shared/icons/Icon.jsx';
import { KIND_LABEL } from '@shared/data/emptyStates.js';

/**
 * An honest empty state, in Hybrid's chrome.
 *
 * Takes one entry from shared/data/emptyStates.js — the wording is shared with Classic, only the
 * look lives here. The kind badge is visible on purpose: "not connected" and "no records" are
 * different answers and the screen should say which one it is giving.
 */
export default function EmptyPanel({ state }) {
  return (
    <div className="card" role="status" data-empty-kind={state.kind}
      style={{ textAlign: 'center', padding: '34px 24px', borderStyle: 'dashed' }}>
      <span className="k-icon" style={{ margin: '0 auto 12px' }}><Icon name={state.icon} size={18} /></span>
      <div style={{ fontSize: 15, fontWeight: 650, marginBottom: 6 }}>{state.title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink-dim)', maxWidth: 440, margin: '0 auto 12px', lineHeight: 1.5 }}>{state.body}</div>
      <span className="chip">{KIND_LABEL[state.kind]}</span>
    </div>
  );
}
