/**
 * A small TTL cache, with one rule that is not negotiable.
 *
 * **The caller is part of the key.** The same query legitimately returns different rows for
 * different people — that is the whole point of read-time scoping — so a cache keyed on the
 * request alone would serve one employee another's leave. That is not a stale-data bug, it is a
 * data leak, and it is the single most likely way this system could leak HR records.
 *
 * `key()` below therefore takes the caller first and refuses to build a key without one. Callers
 * cannot forget, because there is no overload that omits it.
 *
 * Deliberately in-memory and per-process. On Catalyst this is replaced by Catalyst Cache; the
 * interface is four methods so that swap is contained. Until then a warm process gets the benefit
 * and a cold start does not, which is the right trade for a POC.
 */

/** Entries are dropped lazily on read, and swept when the map grows past this. */
const MAX_ENTRIES = 500;

export function createCache({ now = () => Date.now() } = {}) {
  const store = new Map();

  function sweep() {
    const t = now();
    for (const [k, entry] of store) if (entry.expiresAt <= t) store.delete(k);
    // Still too big after dropping expired entries: evict oldest-first. A cache that grows
    // without bound inside a function runtime is a memory leak with extra steps.
    if (store.size > MAX_ENTRIES) {
      const excess = store.size - MAX_ENTRIES;
      let i = 0;
      for (const k of store.keys()) {
        if (i++ >= excess) break;
        store.delete(k);
      }
    }
  }

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= now()) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },

    set(key, value, ttlSeconds) {
      if (store.size >= MAX_ENTRIES) sweep();
      store.set(key, { value, expiresAt: now() + Math.max(1, ttlSeconds) * 1000 });
      return value;
    },

    /** Read-through. The loader runs only on a miss, and a rejection is never cached. */
    async wrap(key, ttlSeconds, loader) {
      const hit = this.get(key);
      if (hit !== undefined) return hit;
      const value = await loader();
      this.set(key, value, ttlSeconds);
      return value;
    },

    delete: (key) => store.delete(key),
    clear: () => store.clear(),
    size: () => store.size,
  };
}

/**
 * Build a cache key.
 *
 * `callerId` is the first parameter and is required. Passing a falsy one throws rather than
 * producing a shared key — a key that silently drops the caller is exactly the leak described
 * above, and it would look like a working cache.
 */
export function cacheKey(callerId, ...parts) {
  if (!callerId) {
    throw new Error('cache: a cache key must include the caller — an unscoped key leaks data between users');
  }
  return [callerId, ...parts.map(stable)].join('|');
}

/** Stable stringification, so key order in an object cannot change the key. */
function stable(part) {
  if (part == null) return '';
  if (typeof part !== 'object') return String(part);
  if (Array.isArray(part)) return `[${part.map(stable).join(',')}]`;
  return `{${Object.keys(part).sort().map((k) => `${k}:${stable(part[k])}`).join(',')}}`;
}

/** The process-wide cache. Swapped for Catalyst Cache when this deploys. */
export const cache = createCache();
