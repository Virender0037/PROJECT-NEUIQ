/**
 * Roles and rank — the vocabulary the whole authorization layer is written in.
 *
 * Extracted from services/zoho-people/tools/index.js and dashboards/query.service.js, where the
 * same three roles were declared in two places. They are not a Zoho concept: Zoho knows about
 * employees and reporting lines; who may call THIS API as an admin is our decision, and
 * conflating the two is how an HR-admin flag ends up inferred from a job title.
 *
 * Nothing in here imports anything. That is deliberate — it is the bottom of the dependency
 * graph, so policy can never end up depending on a product.
 */

/** Who outranks whom. 'team' covers managers and admins; 'admin' is admins only. */
export const ROLE_RANK = { employee: 0, manager: 1, hr_admin: 2 };

/** The minimum rank each tool scope demands. */
export const SCOPE_MIN = { self: 0, team: 1, admin: 2 };

/** Admin-ness is a property of the caller's role, never inferred from their job title. */
export const isAdmin = (user) => user?.role === 'hr_admin';

/**
 * Does this role clear that scope?
 *
 * Split out from `mayCall` so the rank comparison lives with the ranks rather than with the tool
 * registry — the registry knows which scope a tool declares, this file knows what a scope costs.
 */
export const rankAllows = (scope, role) => (ROLE_RANK[role] ?? -1) >= SCOPE_MIN[scope];
