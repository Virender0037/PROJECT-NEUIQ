import { LineChart, PieChart, BarChart, fmt } from '@shared/components/charts.jsx';
import { useKpis, useWidgetRows } from '@shared/dashboards/useWidget.js';

/**
 * Widget — Classic's card around a widget spec.
 *
 * The twin of ui/hybrid/components/Widget.jsx: same hooks, same charts, same three load states,
 * different chrome. Only the palette, the card and the table markup differ, because those are
 * the parts that are meant to look different. Anything else diverging between the two would mean
 * one of them showing a figure the other does not.
 */

/**
 * Classic's series colours.
 *
 * Not the same variable names as Hybrid's — this style has `--green`/`--amber`/`--red` where
 * Hybrid has `--ok`/`--warn`/`--wait`. That is exactly why the shared charts take the palette as
 * a prop; an unset CSS variable in a `fill` renders nothing and reports nothing.
 */
const PALETTE = ['var(--accent)', 'var(--green)', 'var(--amber)', 'var(--red)', 'var(--text-muted)'];
const CHART_PROPS = { palette: PALETTE, dimColor: 'var(--text-subtle)' };

const CARD = {
  border: 'var(--border-w) solid var(--border)',
  background: 'var(--surface)',
  borderRadius: 14,
  padding: 16,
  boxShadow: 'var(--sh-xs)',
  minWidth: 0,
};

const Card = ({ title, span = 1, children }) => (
  <div style={{ ...CARD, gridColumn: `span ${span}` }}>
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
      fontSize: 13, fontWeight: 600, color: 'var(--text)',
    }}>{title}</div>
    {children}
  </div>
);

const Note = ({ children }) => (
  <div style={{ fontSize: 13, color: 'var(--text-subtle)', padding: '18px 0', textAlign: 'center' }}>{children}</div>
);

/** A skeleton at the card's real height, so the grid does not reflow when the data lands. */
const Skeleton = ({ title, span }) => (
  <Card title={title} span={span}>
    <div className="nr-skel" style={{ height: 150 }} aria-busy="true" aria-label="Loading" />
  </Card>
);

/**
 * A 403 is worded as a permission, not a fault: it happens when a dashboard built by an HR admin
 * is opened by an employee, and "you may not see this" is the honest answer. Sample numbers in
 * its place would misrepresent someone's access.
 */
const Failed = ({ title, span, error }) => (
  <Card title={title} span={span}>
    <Note>{error?.status === 403 ? 'Not available on your account.' : error?.message || 'Could not load this widget.'}</Note>
  </Card>
);

/** The "these are not real figures" marker, shown only when the API could not be reached. */
const SampleTag = () => (
  <span
    title="The API is unreachable — showing sample figures"
    style={{
      padding: '1px 6px', borderRadius: 999, border: '1px solid var(--amber)', color: 'var(--amber)',
      fontSize: 10, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase',
    }}
  >sample</span>
);

const head = (title, source) => (
  <>
    <span style={{ flex: 1, minWidth: 0 }}>{title}</span>
    {source === 'sample' && <SampleTag />}
  </>
);

function KpiWidget({ title }) {
  const { data, loading, error, source } = useKpis();
  if (loading) return <Skeleton title={title} span={3} />;
  if (error) return <Failed title={title} span={3} error={error} />;
  return (
    <Card title={head(title, source)} span={3}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 16 }}>
        {data.kpis.map((k) => (
          <div key={k.name}>
            <div style={{ fontFamily: 'Geist', fontSize: 26, fontWeight: 600, color: 'var(--text)' }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-subtle)', marginTop: 3 }}>{k.name}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QueryWidget({ widget, title }) {
  const { rows, loading, error, source } = useWidgetRows(widget);
  // A pie needs its legend beside it and a table needs width; a bar list is happy narrow.
  const span = widget.type === 'pie' || widget.type === 'donut' || widget.type === 'table' ? 2 : 1;

  if (loading) return <Skeleton title={title} span={span} />;
  if (error) return <Failed title={title} span={span} error={error} />;

  const h = head(title, source);
  if (!rows.length) return <Card title={h} span={span}><Note>No data.</Note></Card>;

  if (widget.type === 'table') {
    return (
      <Card title={h} span={span}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {[widget.query?.groupBy || 'Name', 'Value'].map((c) => (
                  <th key={c} style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--text-subtle)', fontWeight: 600, borderBottom: 'var(--border-w) solid var(--border)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} style={{ borderTop: 'var(--border-w) solid var(--border)' }}>
                  <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{r.name}</td>
                  <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt(r.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
  if (widget.type === 'pie' || widget.type === 'donut') {
    return <Card title={h} span={span}><PieChart rows={rows} donut={widget.type === 'donut'} holeColor="var(--surface)" {...CHART_PROPS} /></Card>;
  }
  if (widget.type === 'line' || widget.type === 'area') {
    return <Card title={h} span={2}><LineChart rows={rows} area={widget.type === 'area'} {...CHART_PROPS} /></Card>;
  }
  return <Card title={h} span={span}><BarChart rows={rows} trackColor="var(--hover)" {...CHART_PROPS} /></Card>;
}

/**
 * Split in two because a kpi tile and a chart tile load from different endpoints, and one
 * component calling one hook or the other conditionally is not something React allows.
 */
export default function Widget({ widget }) {
  const title = widget.title || 'Widget';
  return widget.type === 'kpi'
    ? <KpiWidget title={title} />
    : <QueryWidget widget={widget} title={title} />;
}
