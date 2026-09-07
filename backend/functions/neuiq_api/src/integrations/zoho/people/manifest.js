/**
 * The Zoho People integration manifest.
 *
 * One object declaring everything this product contributes to the core: its tools, its query
 * sources, and its employee directory. Core imports none of it — the composition root in
 * integrations/registry.js reads this and registers the parts.
 *
 * The point of the shape is the next product. Adding Zoho CRM should mean writing a second
 * manifest and adding one line to the registry, with **zero edits under core/**. If a future
 * product forces a core change, the abstraction is wrong and should be fixed rather than worked
 * around.
 *
 * Fields the later phases will add, listed here so the shape is visible before it is needed:
 *
 *   scopes    OAuth scopes this product needs          (Phase 2)
 *   client    the authenticated API client             (Phase 3)
 *   health    reachability + token validity for /health (Phase 3)
 *   widgets   the builder's widget catalogue           (Phase 1)
 *   keywords  the keyword router's vocabulary          (Phase 1)
 */
import { PEOPLE_SOURCES } from './sources.js';
import { PEOPLE_TOOLS } from './tools/index.js';
import { directory } from './directory.js';

export default {
  key: 'zoho.people',
  vendor: 'zoho',
  product: 'people',
  label: 'Zoho People',

  sources: PEOPLE_SOURCES,
  tools: PEOPLE_TOOLS,
  directory,
};
