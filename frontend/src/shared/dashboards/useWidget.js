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
import { resolveQuery, SAMPLE_KPIS } from './index.js';

/**
 * The headline numbers a kpi tile shows.
 *
 * They come from GET /analytics/summary, which scopes them to the caller: an employee sees their
 * own leave days and their department, an HR admin sees the organisation's. Same tile, same
 * dashboard, different numbers — which is exactly why a widget cannot store its value.
 */
export function useKpis() {
  return useApi(
    (signal) => api.analyticsSummary({ signal }),
    [],
    { fallback: () => ({ kpis: SAMPLE_KPIS }) },
  );
}

/**
 * Run one widget's stored query.
 *
 * The query is the dependency, serialized — a tile whose spec is edited in the chart builder
 * re-resolves, and one merely re-rendered by its parent does not.
 *
 * No `fallback` on purpose. `resolveQuery` already substitutes sample rows when the server is
 * unreachable and reports `source: 'sample'` for it; a second fallback here would swallow the
 * 403 that says "you may not read this source", and that refusal must reach the screen.
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
