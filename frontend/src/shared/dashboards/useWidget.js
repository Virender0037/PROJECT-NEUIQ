/**
 * Loading one widget — the half of a widget that is identical in every UI style.
 *
 * A tile has two possible sources depending on its type, and picking between them with a
 * conditional hook is not something React allows. So there are two hooks, and the UI's Widget
 * component chooses by rendering one of two components. That is the whole reason for the split;
 * see the note at the bottom of each style's Widget.jsx.
 *
 * What lives here: the request, the three states, the fallback policy. What does not: the card
 * chrome, the palette, the skeleton — those are per-style, because those are the parts that
 * should look different.
 */
import { useApi, api } from '../api/index.js';
import { resolveQuery } from './index.js';

/**
 * The headline numbers a kpi tile shows.
 *
 * They come from GET /analytics/summary, which scopes them to the caller: an employee sees their
 * own leave days and their department, an HR admin sees the organisation's. Same tile, same
 * dashboard, different numbers — which is exactly why a widget cannot store its value.
 */
export function useKpis() {
  // No fallback. These used to become SAMPLE_KPIS ("Headcount 105", "Pending approvals 12") when
  // the server was unreachable — shown to an employee who may not see headcount at all. A failure
  // now reaches the tile as an error: unavailable, or not permitted.
  return useApi((signal) => api.analyticsSummary({ signal }), []);
}

/**
 * Run one widget's stored query.
 *
 * The query is the dependency, serialized — a tile whose spec is edited in the chart builder
 * re-resolves, and one merely re-rendered by its parent does not.
 *
 * Failures pass straight through: `resolveQuery` throws for an unreachable server and for a 403
 * alike, so the tile can say "unavailable" or "not permitted" — and the refusal that says "you
 * may not read this source" always reaches the screen.
 */
export function useWidgetRows(widget) {
  const key = JSON.stringify(widget?.query || null);
  const state = useApi(
    (signal) => resolveQuery(widget.query, { signal }),
    [key],
  );
  return {
    ...state,
    rows: state.data?.data || [],
    // 'api' from useApi means the request succeeded; whether the ROWS were live or sampled is
    // resolveQuery's answer, so it wins.
    source: state.data?.source || state.source,
  };
}
