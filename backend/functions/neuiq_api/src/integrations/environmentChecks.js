/**
 * Each integration's startup requirement, for the environment profile (core/platform/environment.js).
 *
 * Separate from registry.js on purpose: importing the registry BUILDS every integration's manifest,
 * and a live manifest reads credentials. server.js must be able to run these checks — and refuse —
 * before any of that happens. Nothing here has an import-time side effect.
 */
import { zohoPeopleEnvironmentCheck } from './zoho/people/dataSource.js';

export const ENVIRONMENT_CHECKS = Object.freeze([zohoPeopleEnvironmentCheck]);
