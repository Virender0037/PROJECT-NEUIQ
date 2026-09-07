/**
 * The composition root — the one place that knows which integrations are enabled.
 *
 * This module is what makes the dependency graph point the right way. Core declares interfaces
 * (a source registry, a tool registry, an identity resolver, a directory); an integration
 * implements them; this file introduces the two. Nothing under core/ imports anything under
 * integrations/, which is the property the whole refactor exists to establish.
 *
 * **Import this before reading either registry.** Registration happens at module evaluation, so
 * anything that reads TOOLS or SOURCES must have this in its import graph first. app.js and
 * tests/check.mjs both import it at the top for exactly that reason.
 *
 * Adding a product: import its manifest, add it to INTEGRATIONS. Nothing else in this file, and
 * nothing at all under core/.
 */
import { registerSources } from '../core/query/sources.js';
import { registerTools } from '../core/tools/registry.js';
import { setIdentityResolver } from '../core/auth/principal.js';
import { setDirectory } from '../core/policy/authorize.js';

import people from './zoho/people/manifest.js';

/** Every enabled integration, in registration order. */
export const INTEGRATIONS = [people];

for (const integration of INTEGRATIONS) {
  if (integration.sources) registerSources(integration.sources);
  if (integration.tools) registerTools(integration.tools);
}

/**
 * Identity and the employee directory both currently come from Zoho People, because People is
 * where employee records live and this is an HR product.
 *
 * When a second product arrives, this stays pointed at People rather than becoming a list: an
 * employee directory has one authoritative source, and merging two would mean deciding which
 * wins. That decision belongs in docs/backend/16-identity-authorization.md, not here.
 */
setIdentityResolver(people.directory.resolve);
setDirectory(people.directory);

/** The employee directory, for the composition root's own use in app.js. */
export const directory = people.directory;
