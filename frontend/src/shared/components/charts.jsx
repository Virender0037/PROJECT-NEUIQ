/**
 * The chart primitives, shared by both UI styles.
 *
 * Inline SVG rather than a chart library. Five types over `{name, value}` rows is the code below;
 * recharts is ~500KB and would be loaded by every style. When a screen genuinely needs a sankey
 * or a treemap, that is the moment to add one — not before.
 *
 * ## Why `palette` is a prop and not a stylesheet lookup
 *
 * Each UI style names its colours differently — Hybrid has `--accent-2`, `--ok`, `--warn`;
 * Classic has `--green`, `--red`, `--amber`. A chart that hardcoded either set would silently
 * fall back to browser defaults in the other style, and an unset CSS variable produces no error.
 * Passing the palette in means the failure is impossible rather than invisible.
 *
 * Everything here is presentational: no data loading, no theming decisions, no chrome. The Card
 * around a chart belongs to the UI style, because that is the part that should look different.
 */

/** One decimal for fractions, none for whole numbers. Hours read as 8.4, headcount as 42. */
export const fmt = (n) => (Number.isInteger(n) ? String(n) : Number(n).toFixed(1));

/** Shared geometry for line and area: rows -> points across a 0..W by 0..H box. */
function points(rows, w, h, pad) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  // The floor is 0, not the minimum value: a y-axis starting at the smallest bar exaggerates
  // small differences into dramatic ones, which is the classic way to mislead with a chart.
  const min = Math.min(...rows.map((r) => r.value), 0);
  const span = max - min || 1;
  const step = rows.length > 1 ? (w - pad * 2) / (rows.length - 1) : 0;
  return rows.map((r, i) => [pad + i * step, h - pad - ((r.value - min) / span) * (h - pad * 2)]);
}

export function LineChart({ rows, area, palette, dimColor = 'currentColor' }) {
  const W = 460, H = 190, PAD = 16;
  const pts = points(rows, W, H, PAD);
  const stroke = palette[0];
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
  const fill = `${path} L ${pts[pts.length - 1][0]} ${H - PAD} L ${pts[0][0]} ${H - PAD} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={190} role="img" aria-label="Line chart">
        {/* fillOpacity on the stroke colour, not an rgba() literal: the two styles do not both
            define an --accent-rgb triple, and an undefined CSS variable in a fill produces no
            error — just an invisible area. */}
        {area && <path d={fill} fill={stroke} fillOpacity={0.14} />}
        <path d={path} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={stroke} />)}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: dimColor, marginTop: 2 }}>
        {rows.map((r) => <span key={r.name}>{r.name}</span>)}
      </div>
    </div>
  );
}

export function PieChart({ rows, donut, palette, dimColor = 'currentColor', holeColor = 'var(--panel, var(--surface))' }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const R = 78, C = 90;
  let angle = -Math.PI / 2;   // start at twelve o'clock, where a reader expects a pie to begin
  const arcs = rows.map((r, i) => {
    const slice = (r.value / total) * Math.PI * 2;
    const [x1, y1] = [C + R * Math.cos(angle), C + R * Math.sin(angle)];
    angle += slice;
    const [x2, y2] = [C + R * Math.cos(angle), C + R * Math.sin(angle)];
    const large = slice > Math.PI ? 1 : 0;
    return (
      <path
        key={r.name}
        d={`M ${C} ${C} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`}
        fill={palette[i % palette.length]}
      />
    );
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <svg viewBox="0 0 180 180" width={168} height={168} role="img" aria-label={donut ? 'Donut chart' : 'Pie chart'}>
        {arcs}
        {/* The hole is a filled circle in the card's own colour rather than a mask: one element,
            and it stays correct when the theme changes. */}
        {donut && <circle cx={C} cy={C} r={R * 0.58} fill={holeColor} />}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 130, flex: 1 }}>
        {rows.map((r, i) => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: palette[i % palette.length], flex: '0 0 auto' }} />
            <span style={{ flex: 1, minWidth: 0 }}>{r.name}</span>
            <span style={{ fontWeight: 650 }}>{fmt(r.value)}</span>
            <span style={{ color: dimColor, width: 38, textAlign: 'right' }}>
              {Math.round((r.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal bars, not vertical.
 *
 * Category labels here are things like "Engineering" and "Sep 2026". Horizontal bars give them a
 * full line of room; vertical ones force rotated text or truncation.
 */
export function BarChart({ rows, palette, dimColor = 'currentColor', trackColor = 'var(--hairline-2, var(--hover))' }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
          <span style={{ width: 92, flex: '0 0 auto', color: dimColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name}
          </span>
          <span style={{ flex: 1, height: 9, borderRadius: 99, background: trackColor, overflow: 'hidden' }}>
            <span style={{
              display: 'block', height: '100%', borderRadius: 99, background: palette[0],
              width: `${(r.value / max) * 100}%`,
              // The one animated property, and it is a width transition on a bar that has just
              // been fetched — nothing else on the page is moving, so it reads as the data
              // arriving rather than as decoration.
              transition: 'width var(--t-base, .3s) var(--ease, ease)',
            }} />
          </span>
          <span style={{ width: 46, textAlign: 'right', fontWeight: 650 }}>{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
