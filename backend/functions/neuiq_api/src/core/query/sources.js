/**
 * The source registry — what may be asked of what.
 *
 * **This registry is the security boundary.** Every field name that reaches the data layer has to
 * appear here first, so there is no injection surface and no write path.
 *
 * It was a `const SOURCES` literal inside dashboards/query.service.js, which meant the query
 * engine had to know about Zoho People to exist. Now it is a registry an integration fills at
 * boot, so the engine knows about sources in the abstract and nothing about any product.
 *
 * Each registered source declares:
 *
 *   label     what to call it in a message
 *   group     the fields it may be grouped by
 *   numeric   the fields it may aggregate
 *   scope     (employeeId) => filter, pinning it to one person. `null` means admin-only.
 *   rows      () => the records. The engine calls this instead of importing a dataset.
 *
 * `rows` is the whole inversion in one field: the engine used to import the People seed directly.
 */
import { isAdmin } from '../policy/roles.js';

/**
 * The live registry.
 *
 * Exported as a plain object mutated in place rather than replaced, so a module that captured the
 * binding before boot still sees the registered sources afterwards.
 */
export const SOURCES = {};

/** Register a product's sources. Called once per integration by integrations/registry.js. */
export function registerSources(defs) {
  for (const [key, def] of Object.entries(defs || {})) {
    if (SOURCES[key]) throw new Error(`query: source "${key}" is already registered`);
    SOURCES[key] = def;
  }
}

/** Look one up. Returns undefined for anything unregistered — the caller decides what that means. */
export const getSource = (key) => SOURCES[String(key)];

/**
 * The source list handed to the model: labels and field names only, never rows, and never the
 * `scope` function — that is an internal the model has no business seeing.
 */
export function schemaFor(user) {
  return Object.entries(SOURCES)
    .filter(([, s]) => isAdmin(user) || !s.adminOnly)
    .map(([source, s]) => ({ source, label: s.label, group: s.group, numeric: s.numeric }));
}
