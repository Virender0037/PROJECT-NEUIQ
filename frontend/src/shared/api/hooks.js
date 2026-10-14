/**
 * React hooks over the API client.
 *
 * There is exactly one hook, `useApi`, and everything else in the app is a call to it. The
 * reason it exists rather than each screen writing its own `useEffect` + fetch is that four
 * things are easy to get wrong and are wrong in the same way every time:
 *
 *  1. **Setting state after unmount.** Navigate away mid-flight and the screen that is gone
 *     still resolves. `useApi` aborts on cleanup and ignores anything that arrives after.
 *  2. **The stale response.** Change a filter twice quickly and the first response can land
 *     after the second. Each run is tagged, and a response from a superseded run is dropped.
 *  3. **The three-state truth.** `loading`, `data` and `error` are not independent — a screen
 *     that keeps stale `data` visible next to a new `error` shows two contradictory things at
 *     once. Here a run either replaces the data or records the error.
 *  4. **No substitutes.** A failure is an error, whatever the cause. This hook used to accept a
 *     `fallback` that supplied local sample data when the server was unreachable — labelled, but
 *     still invented figures in an HR product. It was removed in Phase 4: an unreachable server
 *     is reported as unavailable (`error.offline`), a 403 as a refusal, and neither ever becomes
 *     a successful-looking response.
 */
import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import { isOffline, onOfflineChange } from './client.js';

/**
 * Run an async loader, with cancellation.
 *
 * @param loader   (signal) => Promise<T>   the API call
 * @param deps     dependency array — the loader re-runs when these change
 * @param options  { enabled: boolean }
 * @returns { data, loading, error, source, reload }  where source is 'api' | null
 */
export function useApi(loader, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: enabled, error: null, source: null });

  // A counter, not a boolean: it identifies WHICH run a response belongs to, which is what makes
  // out-of-order responses detectable rather than just ignorable-after-unmount.
  const runId = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback((signal) => {
    const id = ++runId.current;
    const mine = () => id === runId.current;
    setState((s) => ({ ...s, loading: true, error: null }));

    return Promise.resolve(loaderRef.current(signal))
      .then((data) => { if (mine()) setState({ data, loading: false, error: null, source: 'api' }); })
      .catch((err) => {
        if (!mine() || signal?.aborted) return;
        // Every failure is reported as itself. An unreachable server is `err.offline`; a 403 is
        // a real answer about this account's permissions. Neither is replaced with data.
        setState({ data: null, loading: false, error: err, source: null });
      });
  }, []);

  useEffect(() => {
    if (!enabled) { setState({ data: null, loading: false, error: null, source: null }); return undefined; }
    const controller = new AbortController();
    run(controller.signal);
    return () => { controller.abort(); runId.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, enabled, ...deps]);

  /** Re-run by hand — after a save, or from a "retry" button on the error state. */
  const reload = useCallback(() => run(), [run]);

  return { ...state, reload };
}

/**
 * Subscribe to backend reachability.
 *
 * `useSyncExternalStore` rather than a `useState` + `useEffect` pair because the flag lives
 * outside React and can change during a render pass triggered by the very request that changed
 * it; the store API is the one that cannot tear.
 */
export function useOffline() {
  return useSyncExternalStore(onOfflineChange, isOffline, () => false);
}
