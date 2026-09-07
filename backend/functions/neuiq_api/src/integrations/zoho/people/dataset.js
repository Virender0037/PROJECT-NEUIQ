/**
 * The one People dataset instance.
 *
 * It used to live in dashboards/query.service.js as `export const dataset = seed`, with the
 * comment "exported here so there is one instance, not one per importer". That reasoning was
 * right and is preserved — but the query service was the wrong owner, because it made the generic
 * query engine the holder of Zoho People's records.
 *
 * This module is the owner now: the sources, the tools and the directory all read from here, and
 * `buildSeed()` runs exactly once.
 *
 * **Phase 3 seam.** When the live client lands, this module chooses between the seed and Zoho by
 * configuration at boot — never by failure at request time. See docs/backend/05.
 */
import { buildSeed } from './seed.js';

export const dataset = buildSeed();
