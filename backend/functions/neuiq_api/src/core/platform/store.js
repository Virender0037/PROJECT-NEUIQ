/**
 * The persistence layer, behind one interface.
 *
 * This wrapper is the whole reason the backend runs on a laptop. `zcatalyst-sdk-node` only works
 * inside the Catalyst runtime, so if `dashboards/routes.js` imported it directly you could not
 * start the server or score an eval suite without deploying. Every module goes through
 * `collection(name)` instead, and swapping the file-backed implementation for Catalyst Data Store
 * is a change to this file alone.
 *
 * ponytail: whole-file rewrite per mutation, O(n) scan per query. Fine at a few hundred
 * dashboards; the ceiling is roughly 10k rows or the first concurrent writer. The upgrade path is
 * Catalyst Data Store with `ownerId` indexed — see docs/backend/15-dashboards.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The backend root, found by walking up to the directory holding package.json.
 *
 * It used to be a fixed count of `..` hops, which silently broke the moment this file moved one
 * level deeper during the core extraction: the same four hops landed on `backend/functions/db`
 * instead of `backend/db`, and the store quietly started writing to a new empty directory. Nothing
 * failed — it just lost every saved dashboard. Anchoring on package.json means where this file
 * sits no longer changes where the data goes.
 */
function backendRoot(from) {
  let dir = from;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'package.json'))) return dir;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return from;
}

const DB_DIR = process.env.NEUIQ_DB_DIR || join(backendRoot(HERE), 'db');

/** In-memory mirror, so a read does not hit disk on every request. */
const cache = new Map();

function file(name) {
  return join(DB_DIR, `${name}.json`);
}

function load(name) {
  if (cache.has(name)) return cache.get(name);
  let rows = [];
  try {
    if (existsSync(file(name))) rows = JSON.parse(readFileSync(file(name), 'utf8'));
  } catch {
    // A corrupt file must not stop the server booting. Start empty and say so - silently
    // serving [] while the real data sits unreadable on disk is the worse failure.
    console.warn(`[store] ${name}.json unreadable, starting empty`);
    rows = [];
  }
  if (!Array.isArray(rows)) rows = [];
  cache.set(name, rows);
  return rows;
}

function persist(name, rows) {
  cache.set(name, rows);
  mkdirSync(DB_DIR, { recursive: true });
  writeFileSync(file(name), JSON.stringify(rows, null, 2), 'utf8');
}

let seq = 0;
/** Ids are prefixed and monotonic so a log line tells you what kind of thing it refers to. */
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * One collection. Every method takes `ownerId` first and filters on it, because ownership is
 * read from the caller's token and must never be something a request body can claim.
 */
export function collection(name) {
  return {
    all: () => load(name),

    listByOwner: (ownerId) => load(name).filter((r) => r.ownerId === ownerId),

    /**
     * Find one row the caller owns. Looks up id AND ownerId together, so a row belonging to
     * someone else is indistinguishable from one that does not exist - which is what you want:
     * a 403 would confirm the id is real.
     */
    findMine: (ownerId, id) => load(name).find((r) => r.id === id && r.ownerId === ownerId) || null,

    insert: (row) => {
      const rows = [...load(name), row];
      persist(name, rows);
      return row;
    },

    update: (ownerId, id, patch) => {
      const rows = load(name);
      const i = rows.findIndex((r) => r.id === id && r.ownerId === ownerId);
      if (i === -1) return null;
      const next = { ...rows[i], ...patch, updatedAt: new Date().toISOString() };
      const copy = [...rows];
      copy[i] = next;
      persist(name, copy);
      return next;
    },

    remove: (ownerId, id) => {
      const rows = load(name);
      const next = rows.filter((r) => !(r.id === id && r.ownerId === ownerId));
      if (next.length === rows.length) return false;
      persist(name, next);
      return true;
    },

    /** Write the collection wholesale. Used by seeding, never by a request handler. */
    replaceAll: (rows) => persist(name, rows),
  };
}

export const dbDir = () => DB_DIR;
