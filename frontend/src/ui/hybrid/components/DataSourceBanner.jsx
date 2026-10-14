import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';

/**
 * A persistent strip saying where the figures come from, whenever that is not live Zoho data.
 *
 * Driven entirely by `app.dataInfo` (shared/lib/dataSource.js), which reads what the backend
 * REPORTS — so "Demo data — not live Zoho People data" appears while NEUIQ_DATA_SOURCE=seed, and
 * nothing appears only when the backend has said 'zoho' or has not answered yet. It sits outside
 * the scrolling page, so it cannot be scrolled away while the numbers on screen are demo.
 */
export default function DataSourceBanner() {
  const { dataInfo } = useApp();
  if (!dataInfo?.banner) return null;
  return (
    <div role="status" aria-live="polite" data-source-kind={dataInfo.kind}
      style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 26px 8px', padding: '7px 14px', borderRadius: 6, fontSize: 12.5, fontWeight: 650, color: 'var(--ink)', background: 'color-mix(in srgb, var(--warn, #d97706) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--warn, #d97706) 45%, transparent)' }}>
      <Icon name="help" size={15} />
      {dataInfo.banner}
    </div>
  );
}
