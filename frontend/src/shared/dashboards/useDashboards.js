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
 *  2. **Only the server persists anything.** This hook used to fall back to seeded sample
 *     dashboards when the API was down — including an admin-only "People" dashboard, offered to
 *     every role — and to apply creates, renames and duplicates in browser memory, which the
 *     screens then announced as "Dashboard saved." (Phase 4 removed both.) Now an unreachable
 *     server leaves the list in an error state, and a write that the server did not confirm
 *     THROWS, so the screen says it was not saved. Previously confirmed rows on screen are kept.
 */
import { useState, useCallback } from 'react';
import { api, useApi } from '@shared/api';

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
    { enabled: wantList },
  );

  /**
   * Server-confirmed edits applied on top of the last list, so a rename shows without a refetch.
   * Only ever written with rows the server returned — never with an unconfirmed change.
   */
  const [confirmed, setConfirmed] = useState(null);
  const list = confirmed ?? data ?? [];
  const applyConfirmed = useCallback((fn) => setConfirmed((cur) => fn(cur ?? data ?? [])), [data]);

  const create = useCallback(async ({ title, widgets }) => {
    // Throws on any failure, including an unreachable server: nothing is saved, nothing is shown.
    const { dashboard } = await api.dashboards.create(title, widgets);
    setConfirmed(null);
    // Re-read only if this caller is showing the list. `reload` ignores `enabled`, so without
    // the guard a save-only screen would fetch rows it never renders.
    if (wantList) await reload();
    return dashboard;
  }, [reload, wantList]);

  const rename = useCallback(async (id, title) => {
    const next = title.trim().slice(0, 80);
    if (!next) return null;                       // an empty rename is a no-op, not a dashboard called ""
    const { dashboard } = await api.dashboards.update(id, { title: next });
    applyConfirmed((l) => l.map((d) => (d.id === id ? dashboard : d)));
    return dashboard;
  }, [applyConfirmed]);

  const duplicate = useCallback(async (row) => {
    const { dashboard } = await api.dashboards.duplicate(row.id);
    applyConfirmed((l) => [...l, dashboard]);
    return dashboard;
  }, [applyConfirmed]);

  const remove = useCallback(async (row) => {
    try {
      await api.dashboards.remove(row.id);
    } catch (err) {
      // A 404 means it is already gone, which is the state the caller wanted. Anything else —
      // including an unreachable server — is a delete that did NOT happen, and must say so
      // rather than vanish from the screen and reappear on the next load.
      if (err.status !== 404) throw err;
    }
    applyConfirmed((l) => l.filter((d) => d.id !== row.id));
  }, [applyConfirmed]);

  return { list, loading, error, source, create, rename, duplicate, remove, reload };
}
