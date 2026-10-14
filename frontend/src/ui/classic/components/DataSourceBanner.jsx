import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';

/**
 * A persistent strip saying where the figures come from, whenever that is not live Zoho data.
 *
 * Driven entirely by `app.dataInfo` (shared/lib/dataSource.js), which reads what the backend
 * REPORTS — so "Demo data — not live Zoho People data" appears while NEUIQ_DATA_SOURCE=seed, and
 * nothing appears only when the backend has said 'zoho' or has not answered yet. Not dismissible:
 * the point is that it cannot be scrolled or clicked away while the numbers on screen are demo.
 */
export default function DataSourceBanner() {
  const { dataInfo } = useApp();
  if (!dataInfo?.banner) return null;
  return (
    <div role="status" aria-live="polite" data-source-kind={dataInfo.kind}
      style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '7px 16px', fontSize: 12.5, fontWeight: 600, color: 'var(--text)', background: 'color-mix(in srgb, var(--amber, #d97706) 18%, var(--surface))', borderBottom: 'var(--border-w) solid color-mix(in srgb, var(--amber, #d97706) 45%, var(--border))' }}>
      <Icon name="help" size={15} />
      {dataInfo.banner}
    </div>
  );
}
