import { useState } from 'react';
import { useApp } from '@shared/context/AppContext.jsx';
import Icon from '@shared/icons/Icon.jsx';
import AnalyticsTabs from '../components/AnalyticsTabs.jsx';
import Widget from '../components/Widget.jsx';
import { useApi, api } from '@shared/api';
import { SOURCES, METRICS, CHART_TYPES, schemaFor, sanitize } from '@shared/dashboards';
import { useDashboards } from '@shared/dashboards/useDashboards.js';

/**
 * Chart Builder — the same data as AI Dashboards, assembled by hand.
 *
 * It drives the identical query DSL, so anything built here is a widget spec that could equally
 * have come from the model, and it saves to the same place. That is the point of having both:
 * the AI route is faster, this one is exact, and neither produces a shape the other cannot read.
 */
// ponytail: native <select>. The design system this borrows from forbids them — an OS-drawn
// option list ignores the theme, which is visible in mono and aqua. The upgrade is porting its
// SearchSelect; until a screen needs search-in-dropdown, three of these are not worth 200 lines.
const CONTROL = {
  height: 34,
  width: '100%',
  border: '1px solid var(--hairline)',
  background: 'var(--menu-bg)',
  borderRadius: 4,
  padding: '0 10px',
  fontSize: 13,
  color: 'var(--ink)',
  fontFamily: 'inherit',
  cursor: 'pointer',
};

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 650, color: 'var(--ink-2)', marginBottom: 5 }}>{label}</span>
      {children}
    </label>
  );
}

export default function ChartBuilder() {
  const app = useApp();
  // Saving only — this screen never renders the list, so it does not fetch it.
  const dash = useDashboards({ list: false });
  const [saving, setSaving] = useState(false);

  /**
   * The pickable sources come from the SERVER, not from the client registry.
   *
   * The difference matters: `employees` is admin-only, and the server's list is already filtered
   * by the caller's role. Offering it to everyone and letting the tile 403 on resolve would read
   * as a broken chart rather than as a permission boundary — the user would keep retrying a
   * combination that can never work.
   */
  const { data: meta } = useApi(
    (signal) => api.dashboards.meta({ signal }),
    [],
    { fallback: () => ({ sources: schemaFor({ isAdmin: false }) }) },
  );
  const schema = meta?.sources || [];

  const [source, setSource] = useState('leave');
  const [groupBy, setGroupBy] = useState('leaveType');
  const [metric, setMetric] = useState('sum');
  const [field, setField] = useState('days');
  const [type, setType] = useState('bar');
  const [title, setTitle] = useState('Leave days by type');

  // The schema entry while it is loading, then the client registry, then an empty shape — the
  // selects render either way instead of throwing on the first paint.
  const def = schema.find((x) => x.source === source) || SOURCES[source] || { group: [], numeric: [] };
  const needsField = metric !== 'count';

  const onSource = (next) => {
    const d = schema.find((x) => x.source === next) || SOURCES[next] || { group: [], numeric: [] };
    setSource(next);
    // the old grouping almost certainly does not exist on the new source
    setGroupBy(d.group[0] || '');
    setField(d.numeric[0] || '');
  };

  /**
   * Save the chart as a one-widget dashboard.
   *
   * There is no separate "reports" store to save into, and inventing one would mean a second
   * shape for the same thing. A dashboard already holds widgets, already re-scopes on read, and
   * is already listed on the next tab — so this lands somewhere the user can actually find it.
   */
  const save = async () => {
    if (!query || saving) return;
    setSaving(true);
    try {
      const row = await dash.create({ title: title.trim() || 'Chart', widgets: [widget] });
      app.pushToast(`Saved to dashboards${row?.local ? ' (offline)' : ''}.`);
      app.go('custom');
    } catch (err) {
      app.pushToast(err.message || 'Could not save that.');
    } finally {
      setSaving(false);
    }
  };

  // Built through sanitize() so the preview can only ever show something the server would accept.
  const query = sanitize({ source, groupBy, metric, field: needsField ? field : undefined, sort: 'desc' });
  const widget = { type, title: title || 'Chart', query };

  return (
    <AnalyticsTabs
      active="builder"
      actions={
        <button className="btn primary" onClick={save} disabled={!query || saving}>
          {saving ? <span className="btn-spin" /> : <Icon name="bookmark" size={15} />}
          {saving ? 'Saving…' : 'Save as dashboard'}
        </button>
      }
    >
      <div className="cb-split">
        <div className="dw-card" style={{ alignSelf: 'start' }}>
          <div className="dw-head">Build</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
            <Field label="Title">
              <input style={{ ...CONTROL, cursor: 'text' }} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Source">
              <select style={CONTROL} value={source} onChange={(e) => onSource(e.target.value)}>
                {schema.map((s) => <option key={s.source} value={s.source}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Group by">
              <select style={CONTROL} value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {def.group.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Field>
            <Field label="Metric">
              <select style={CONTROL} value={metric} onChange={(e) => setMetric(e.target.value)}>
                {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            {needsField && (
              <Field label="Field">
                <select style={CONTROL} value={field} onChange={(e) => setField(e.target.value)}>
                  {def.numeric.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </Field>
            )}
            <Field label="Chart type">
              <div className="seg" style={{ flexWrap: 'wrap' }}>
                {CHART_TYPES.map((t) => (
                  <button key={t} className={type === t ? 'on' : ''} onClick={() => setType(t)}>{t}</button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Widget widget={widget} />
          <div className="dw-card">
            <div className="dw-head">Widget spec</div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-dim)', marginBottom: 10, lineHeight: 1.5 }}>
              This is exactly what gets stored — the question, not the answer. The same shape the
              model emits, and the same shape the server re-scopes to you on every read.
            </p>
            <pre style={{
              margin: 0, padding: 13, borderRadius: 5, overflowX: 'auto',
              background: 'var(--hairline-2)', border: '1px solid var(--hairline)',
              fontSize: 12, lineHeight: 1.55, color: 'var(--ink-2)',
            }}>{JSON.stringify(widget, null, 2)}</pre>
          </div>
        </div>
      </div>
    </AnalyticsTabs>
  );
}
