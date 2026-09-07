/**
 * Saved dashboards: the list, and the four things you can do to it.
 *
 * All of it lives here rather than in the screen because the screen's job is tabs and a grid,
 * and because two decisions in this file are easy to get wrong in a way that only shows up as a
 * confusing UI:
 *
 *  1. **The server's row is the truth after a write.** Every mutation replaces local state with
 *     what came BACK, not with what was sent. `cleanWidgets` on the server drops a widget whose
 *     query does not survive the whitelist, so echoing the optimistic version would show a tile
 *     that is not actually saved — and it would reappear correctly on the next refresh, which is
 *     the worst kind of bug to report.
 *  2. **Offline edits stay local and say so.** With the API down the list falls back to the
 *     seeded samples and edits apply in memory, because a demo you cannot click through is worse
 *     than one that forgets. `source` is what the screen uses to tell you which you are in.
 */
import { useState, useCallback } from 'react';
import { api, ApiError, useApi } from '@shared/api';
import { SEED_DASHBOARDS } from '@shared/data/seedDashboards.js';
import { cleanWidgets } from './index.js';

/** An unreachable server is the only failure that falls back. A 403 is a real answer. */
const isOfflineErr = (err) => err instanceof ApiError && err.offline;

const localId = () => 'd' + Date.now().toString(36);

/**
 * @param {{ list?: boolean }} options
 *   `list: false` gives you the mutations without fetching the list. The Chart Builder only ever
 *   calls `create`, and a screen that requests rows it never renders is a request that can fail,
 *   spin, and confuse — for nothing.
 */
export function useDashboards({ list: wantList = true } = {}) {
  const { data, loading, error, source, reload } = useApi(
    () => api.dashboards.list().then((r) => r.dashboards),
    [],
    // Seeds pass through cleanWidgets() like anything else, so sample data cannot show a tile
    // that real data would not be allowed to save.
    {
      enabled: wantList,
      fallback: () => SEED_DASHBOARDS.map((d) => ({ ...d, widgets: cleanWidgets(d.widgets) })),
    },
  );

  /** Local overlay, so an offline session can still be clicked through. */
  const [local, setLocal] = useState(null);
  const list = local ?? data ?? [];

  /** Start editing in memory from whatever is on screen right now. */
  const seedLocal = useCallback((fn) => setLocal((cur) => fn(cur ?? data ?? [])), [data]);

  const create = useCallback(async ({ title, widgets }) => {
    try {
      const { dashboard } = await api.dashboards.create(title, widgets);
      setLocal(null);
      // Re-read only if this caller is showing the list. `reload` ignores `enabled`, so without
      // the guard a save-only screen would fetch rows it never renders.
      if (wantList) await reload();
      return dashboard;
    } catch (err) {
      if (!isOfflineErr(err)) throw err;
      const row = { id: localId(), title, widgets: cleanWidgets(widgets), local: true };
      seedLocal((l) => [...l, row]);
      return row;
    }
  }, [reload, seedLocal, wantList]);

  const rename = useCallback(async (id, title) => {
    const next = title.trim().slice(0, 80);
    if (!next) return null;                       // an empty rename is a no-op, not a dashboard called ""
    try {
      const { dashboard } = await api.dashboards.update(id, { title: next });
      seedLocal((l) => l.map((d) => (d.id === id ? dashboard : d)));
      return dashboard;
    } catch (err) {
      if (!isOfflineErr(err)) throw err;
      seedLocal((l) => l.map((d) => (d.id === id ? { ...d, title: next } : d)));
      return null;
    }
  }, [seedLocal]);

  const duplicate = useCallback(async (row) => {
    try {
      const { dashboard } = await api.dashboards.duplicate(row.id);
      seedLocal((l) => [...l, dashboard]);
      return dashboard;
    } catch (err) {
      if (!isOfflineErr(err)) throw err;
      const copy = { ...row, id: localId(), title: `${row.title} (copy)`.slice(0, 80), local: true };
      seedLocal((l) => [...l, copy]);
      return copy;
    }
  }, [seedLocal]);

  const remove = useCallback(async (row) => {
    try {
      await api.dashboards.remove(row.id);
    } catch (err) {
      // A 404 means it is already gone, which is the state the caller wanted. Anything else
      // that is not an outage is a real refusal and should surface.
      if (!isOfflineErr(err) && err.status !== 404) throw err;
    }
    seedLocal((l) => l.filter((d) => d.id !== row.id));
  }, [seedLocal]);

  return { list, loading, error, source, create, rename, duplicate, remove, reload };
}
