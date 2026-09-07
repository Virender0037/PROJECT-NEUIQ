/**
 * Argument validation for tool calls.
 *
 * Extracted verbatim from services/zoho-people/tools/index.js — nothing about it was ever
 * People-specific.
 *
 * Deliberately tiny: a handful of tools do not need a schema library. What matters is that it
 * REFUSES. An unknown key or a wrong type throws rather than being quietly dropped, because a
 * silently ignored parameter means the answer is about something other than what was asked.
 */

/**
 * Validate `args` against a tool's `params` schema.
 *
 * Takes the schema rather than a tool name so it has no dependency on the registry — the caller
 * already has the tool in hand. `toolName` is passed only so the error message can name it.
 */
export function validateArgsFor(schema, args = {}, toolName = 'tool') {
  const out = {};
  for (const [key, value] of Object.entries(args)) {
    if (!(key in schema)) {
      const e = new Error(`Unknown parameter "${key}" for ${toolName}`);
      e.status = 400;
      throw e;
    }
    if (value === undefined || value === null || value === '') continue;
    const type = schema[key].replace('?', '');
    if (type === 'number' && Number.isNaN(Number(value))) {
      const e = new Error(`"${key}" must be a number`);
      e.status = 400;
      throw e;
    }
    out[key] = type === 'number' ? Number(value) : String(value);
  }
  for (const [key, type] of Object.entries(schema)) {
    if (!type.endsWith('?') && out[key] === undefined) {
      const e = new Error(`"${key}" is required for ${toolName}`);
      e.status = 400;
      throw e;
    }
  }
  return out;
}
