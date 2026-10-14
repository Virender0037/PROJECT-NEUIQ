import { LineChart, PieChart, BarChart, fmt } from '@shared/components/charts.jsx';
import { useKpis, useWidgetRows } from '@shared/dashboards/useWidget.js';
import { errorState } from '@shared/data/emptyStates.js';

/**
 * Widget — renders one widget SPEC by running its query, never by reading a stored value.
 *
 * This file is only chrome: the card, the palette, the skeleton, the table markup. The request
 * and the three load states live in shared/dashboards/useWidget.js, and the charts themselves in
 * shared/components/charts.jsx — both shared with Classic, so the two styles can never disagree
 * about a number or about which colour means which series.
 */

/** Hybrid's series colours, in the order a multi-series chart consumes them. */
const PALETTE = ['var(--accent)', 'var(--accent-2)', 'var(--ok)', 'var(--warn)', 'var(--wait)'];

/** Passed to the shared charts so their secondary text matches this style's muted ink. */
const CHART_PROPS = { palette: PALETTE, dimColor: 'var(--ink-dim)' };

const Card = ({ title, wide, children }) => (
  <div className={'dw-card' + (wide ? ' wide' : '')}>
    <div className="dw-head">{title}</div>
    {children}
  </div>
);

/** A skeleton at the card's real height, so the grid does not reflow when the data lands. */
const Skeleton = ({ title }) => (
  <Card title={title}><div className="dw-skel" aria-busy="true" aria-label="Loading" /></Card>
);

/**
 * A failed tile explains itself in the tile.
 *
 * A 403 is worded as a permission, not as a fault: it happens when a dashboard built by an HR
 * admin is opened by an employee, and the honest answer is "you may not see this", not
 * "something went wrong". Substituting sample numbers here would misrepresent someone's access,
 * which is the one failure this app must never have.
 */
const Failed = ({ title, error }) => {
  // Shared wording (shared/data/emptyStates.js) so Hybrid and Classic classify a failure alike:
  // a 403 is "not permitted", an unreachable server is "API unavailable" — never a zero, never
  // sample figures. (Offline sample tiles, with their SAMPLE tag, were removed in Phase 4.)
  const s = errorState(error);
  return (
    <Card title={title}>
      <div className="dw-empty" role="status" data-state-kind={s.kind}>
        {s.title}{s.body ? ` ${s.body}` : ''}
      </div>
    </Card>
  );
};

const head = (title) => <>{title}</>;

function KpiWidget({ title }) {
  const { data, loading, error } = useKpis();
  if (loading) return <Skeleton title={title} />;
  if (error) return <Failed title={title} error={error} />;
  return (
    <Card title={head(title)} wide>
      <div className="dw-kpis">
        {data.kpis.map((k) => (
          <div className="dw-kpi" key={k.name}>
            <span className="dw-kpi-v">{k.value}</span>
            <span className="dw-kpi-l">{k.name}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function QueryWidget({ widget, title }) {
  const { rows, loading, error } = useWidgetRows(widget);
  if (loading) return <Skeleton title={title} />;
  if (error) return <Failed title={title} error={error} />;

  const h = head(title);
  if (!rows.length) return <Card title={h}><div className="dw-empty">No data.</div></Card>;

  if (widget.type === 'table') {
    return (
      <Card title={h}>
        <div className="dw-tablewrap">
          <table className="dw-table">
            <thead><tr><th>{widget.query?.groupBy || 'Name'}</th><th>Value</th></tr></thead>
            <tbody>
              {rows.map((r) => <tr key={r.name}><td>{r.name}</td><td>{fmt(r.value)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>
    );
  }
  if (widget.type === 'pie' || widget.type === 'donut') {
    return <Card title={h}><PieChart rows={rows} donut={widget.type === 'donut'} holeColor="var(--panel)" {...CHART_PROPS} /></Card>;
  }
  if (widget.type === 'line' || widget.type === 'area') {
    return <Card title={h}><LineChart rows={rows} area={widget.type === 'area'} {...CHART_PROPS} /></Card>;
  }
  return <Card title={h}><BarChart rows={rows} trackColor="var(--hairline-2)" {...CHART_PROPS} /></Card>;
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
