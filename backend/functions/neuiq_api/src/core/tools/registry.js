/**
 * The tool registry — the allow-list the orchestrator may call.
 *
 * The machinery here was inside services/zoho-people/tools/index.js, mixed in with the six People
 * tools themselves. None of it was People-specific: it is a registry, a rank check and a
 * catalogue. Separating them is what lets a second product register tools without either one
 * knowing about the other.
 *
 * Every registered tool declares five things, and the shape is what makes the guardrails
 * enforceable rather than aspirational:
 *
 *   params       a schema the orchestrator's arguments are validated against. Not advisory: a
 *                call with an unknown or wrong-typed parameter is refused before it runs.
 *   scope        who may call it at all — 'self' | 'team' | 'admin'. Checked against the caller's
 *                role by this registry, never by the tool body and never by the model.
 *   run          the fetch. Returns NORMALIZED, FIELD-WHITELISTED data.
 *   subjectRows  (data) => the rows in a result that are ABOUT an employee, each carrying
 *                `employeeId`. What `assertResultAllowed` checks. Aggregates return [].
 *   say          turns the result into a sentence. Deterministic, so the number in the answer is
 *                always the number the tool returned.
 *
 * That last one is the important one. The model chooses a tool and its parameters; it does not
 * write the figures. `say()` is why a wrong answer is a code bug rather than a hallucination.
 */
import { rankAllows } from '../policy/roles.js';
import { allowedEmployeeIds, assertRowsWithin } from '../policy/authorize.js';
import { validateArgsFor } from './validate.js';

/**
 * The live registry, keyed by tool name.
 *
 * Mutated in place rather than replaced, so a module that captured the binding before boot still
 * sees the registered tools afterwards.
 */
export const TOOLS = {};

/** Register a product's tools. Called once per integration by integrations/registry.js. */
export function registerTools(defs) {
  for (const [name, def] of Object.entries(defs || {})) {
    if (TOOLS[name]) throw new Error(`tools: "${name}" is already registered`);
    // Refused at boot, not defaulted. A tool that cannot say which of its rows are about whom
    // cannot have its output checked, and a default of "nothing to check" is a bypass.
    if (typeof def?.subjectRows !== 'function') {
      throw new Error(`tools: "${name}" must declare subjectRows(data) so its results can be authorized`);
    }
    TOOLS[name] = def;
  }
}

/**
 * Who may call what.
 *
 * The rank comparison itself lives in core/policy/roles.js; this only knows which scope a tool
 * declares. An unregistered tool is refused rather than treated as unrestricted — a model can
 * emit a name that does not exist, and that must be a miss, not a bypass.
 */
export function mayCall(toolName, user) {
  const tool = TOOLS[toolName];
  if (!tool) return false;
  return rankAllows(tool.scope, user?.role);
}

/**
 * Check a tool's result against the caller before it leaves the server.
 *
 * Runs after `run`, on every call, from the orchestrator — not inside each tool — so a tool that
 * forgets its own filter is still caught, and nothing that routes to a tool (the keyword router,
 * the model, a future caller) can return its data without passing through here.
 */
export function assertResultAllowed(toolName, data, user) {
  assertRowsWithin(TOOLS[toolName].subjectRows(data), allowedEmployeeIds(user));
  return data;
}

/** Validate arguments against a registered tool's schema. Refuses; never drops. */
export function validateArgs(toolName, args = {}) {
  return validateArgsFor(TOOLS[toolName].params, args, toolName);
}

/** The catalogue the AI tab renders. Descriptions only — never the tool bodies. */
export const catalogue = (user) =>
  Object.entries(TOOLS).map(([tool, t]) => ({
    tool, label: t.label, sub: t.sub, scope: t.scope,
    params: Object.keys(t.params),
    allowed: mayCall(tool, user),
  }));
