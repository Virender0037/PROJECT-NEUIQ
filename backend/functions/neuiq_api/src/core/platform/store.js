/**
 * The persistence layer, behind one interface — partitioned by deployment namespace (E2.2).
 *
 * This wrapper is the whole reason the backend runs on a laptop. `zcatalyst-sdk-node` only works
 * inside the Catalyst runtime, so if `dashboards/routes.js` imported it directly you could not
 * start the server or score an eval suite without deploying. Every module goes through
 * `collection(name, { namespace })` instead, and swapping the file-backed implementation for
 * Catalyst Data Store is a change to this file alone.
 *
 * ## Namespaces — no data crosses a deployment
 *
 *   dev/seed        `<DB_DIR>/<name>.json` — EXACTLY the pre-E2.2 path, so existing local
 *                   dashboards keep working with no migration, nothing moved, nothing copied
 *   anything else   `<DB_DIR>/ns/<namespace with / as __>/<name>.json`, its own directory
 *
 * So a Zoho test or production deployment never opens the seed/demo file: demo dashboards (owned
 * by seed ids like E1001) cannot appear there. Each directory carries a `.namespace.json` marker,
 * written when the directory is first opened and checked on every later open:
 *
 *   marker names another namespace        REFUSED — this directory belongs to another deployment
 *   marker's credential fingerprint
 *     differs from this deployment's       REFUSED — reopened with another organisation's credentials
 *   another namespace's marker carries
 *     this deployment's fingerprint        REFUSED — two environments sharing one set of credentials
 *   no marker, but data already present    dev: adopted (legacy, pre-E2.2); live: REFUSED (unknown origin)
 *
 * The fingerprint is a truncated hash supplied by the integration — never a client id or secret.
 *
 * ## Unreadable data is never overwritten
 *
 * A file that cannot be parsed used to be replaced by "start empty": the next save then wrote [] over
 * the user's dashboards. Now the collection refuses (503, STORE_UNREADABLE) until someone fixes or
 * moves the file — a visible error beats silent data loss.
 *
 * ## Catalyst Data Store
 *
 * The swap must keep the partition: one `namespace` column, indexed with `ownerId`, filtered on every
 * query, and the marker rules enforced by a per-namespace metadata row. See
 * docs/backend/17-environment-isolation.md.
 *
 * ponytail: whole-file rewrite per mutation, O(n) scan per query. Fine at a few hundred
 * dashboards; the ceiling is roughly 10k rows or the first concurrent writer. The upgrade path is
 * Catalyst Data Store with `ownerId` indexed — see docs/backend/15-dashboards.md.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
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

/**
 * Read when a collection is OPENED, not when this module is imported — so a test (or a future
 * Catalyst handler) can point NEUIQ_DB_DIR at its own directory before the first open, and nothing
 * ever writes into a developer's real backend/db by accident.
 */
const dbRoot = () => process.env.NEUIQ_DB_DIR || join(backendRoot(HERE), 'db');

/** The namespace whose data lives at the pre-E2.2 path. */
export const LEGACY_NAMESPACE = 'dev/seed';
const MARKER = '.namespace.json';
const NAMESPACE = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*){1,3}$/;

export class StoreError extends Error {
  constructor(code, message, status = 503) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    this.status = status;
  }
}

/** In-memory mirror, keyed by FILE, so two namespaces in one process can never share an entry. */
const cache = new Map();
/** Directories already validated in this process. */
const opened = new Map();

export const namespaceDir = (namespace, root = dbRoot()) => (namespace === LEGACY_NAMESPACE
  ? root
  : join(root, 'ns', namespace.replaceAll('/', '__')));

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

/** Every OTHER namespace's marker under this root (the legacy root included). */
function otherMarkers(namespace, root) {
  const out = [];
  const consider = (dir) => {
    const p = join(dir, MARKER);
    if (!existsSync(p)) return;
    try {
      const m = readJson(p);
      if (m?.namespace && m.namespace !== namespace) out.push(m);
    } catch { /* an unreadable sibling marker is that deployment's problem, not a match */ }
  };
  consider(root);
  const nsRoot = join(root, 'ns');
  if (existsSync(nsRoot)) for (const d of readdirSync(nsRoot)) consider(join(nsRoot, d));
  return out;
}

/** Validate (and on first use, mark) a namespace's directory. Throws StoreError on any mismatch. */
function open(namespace, bindings) {
  if (typeof namespace !== 'string' || !NAMESPACE.test(namespace)) {
    throw new StoreError('STORE_NAMESPACE_INVALID', 'store: a valid deployment namespace is required.', 500);
  }
  const fingerprint = bindings?.credentialFingerprint ?? null;
  const root = dbRoot();
  const key = `${root}|${namespace}|${fingerprint}`;
  if (opened.has(key)) return opened.get(key);

  const dir = namespaceDir(namespace, root);
  const markerPath = join(dir, MARKER);

  if (fingerprint && otherMarkers(namespace, root).some((m) => m.credentialFingerprint === fingerprint)) {
    throw new StoreError('STORE_CREDENTIALS_SHARED',
      'store: another deployment namespace was created with these same Zoho credentials. Each environment needs its own credentials.');
  }

  if (existsSync(markerPath)) {
    let marker;
    try { marker = readJson(markerPath); } catch {
      throw new StoreError('STORE_MARKER_UNREADABLE', `store: ${MARKER} in the ${namespace} directory is unreadable; refusing rather than guessing its owner.`);
    }
    if (marker?.namespace !== namespace) {
      throw new StoreError('STORE_NAMESPACE_MISMATCH', 'store: this data directory belongs to another deployment namespace.');
    }
    if (marker.credentialFingerprint && fingerprint && marker.credentialFingerprint !== fingerprint) {
      throw new StoreError('STORE_CREDENTIALS_CHANGED',
        'store: this deployment\'s data was created with different Zoho credentials — possibly another organisation. Refusing to mix them.');
    }
  } else {
    const existing = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
    if (existing.length && namespace !== LEGACY_NAMESPACE) {
      throw new StoreError('STORE_UNMARKED_DATA', `store: the ${namespace} directory holds data with no namespace marker; refusing data of unknown origin.`);
    }
    // dev/seed with pre-E2.2 files: adopted in place — nothing is moved, rewritten or deleted.
    mkdirSync(dir, { recursive: true });
    writeFileSync(markerPath, JSON.stringify({
      namespace, credentialFingerprint: fingerprint, createdAt: new Date().toISOString(),
      adoptedLegacyFiles: existing.length > 0,
    }, null, 2), 'utf8');
  }
  const handle = { namespace, dir };
  opened.set(key, handle);
  return handle;
}

function load(path, label) {
  if (cache.has(path)) return cache.get(path);
  if (!existsSync(path)) { cache.set(path, []); return cache.get(path); }
  let rows;
  try { rows = readJson(path); } catch { rows = undefined; }
  if (!Array.isArray(rows)) {
    // Never "start empty": the next save would overwrite the real data with [].
    console.warn(`[store] ${label} is unreadable — refusing reads and writes until it is repaired`);
    throw new StoreError('STORE_UNREADABLE', 'Saved dashboards could not be read; nothing was changed.');
  }
  cache.set(path, rows);
  return rows;
}

function persist(path, dir, rows) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(rows, null, 2), 'utf8');
  cache.set(path, rows);
}

let seq = 0;
/** Ids are prefixed and monotonic so a log line tells you what kind of thing it refers to. */
export const newId = (prefix) => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * One collection in one deployment namespace. Every method takes `ownerId` first and filters on
 * it, because ownership is read from the caller's token and must never be something a request
 * body can claim. Opening validates the namespace directory and throws on any mismatch — so a
 * deployment pointed at the wrong data refuses at startup, not on the first save.
 *
 * @param namespace  the deployment namespace (core/platform/environment.js) — REQUIRED
 * @param bindings   { credentialFingerprint } from the profile's integrations, or nothing (dev)
 */
export function collection(name, { namespace, bindings = {} } = {}) {
  const { dir } = open(namespace, bindings);
  const path = join(dir, `${name}.json`);
  const label = `${name}.json (${namespace})`;
  const rows = () => load(path, label);

  return {
    namespace,
    all: () => rows(),

    listByOwner: (ownerId) => rows().filter((r) => r.ownerId === ownerId),

    /**
     * Find one row the caller owns. Looks up id AND ownerId together, so a row belonging to
     * someone else is indistinguishable from one that does not exist - which is what you want:
     * a 403 would confirm the id is real.
     */
    findMine: (ownerId, id) => rows().find((r) => r.id === id && r.ownerId === ownerId) || null,

    insert: (row) => {
      const next = [...rows(), row];
      persist(path, dir, next);
      return row;
    },

    update: (ownerId, id, patch) => {
      const current = rows();
      const i = current.findIndex((r) => r.id === id && r.ownerId === ownerId);
      if (i === -1) return null;
      const next = { ...current[i], ...patch, updatedAt: new Date().toISOString() };
      const copy = [...current];
      copy[i] = next;
      persist(path, dir, copy);
      return next;
    },

    remove: (ownerId, id) => {
      const current = rows();
      const next = current.filter((r) => !(r.id === id && r.ownerId === ownerId));
      if (next.length === current.length) return false;
      persist(path, dir, next);
      return true;
    },

    /** Write the collection wholesale. Used by seeding, never by a request handler. */
    replaceAll: (all) => persist(path, dir, all),
  };
}

export const dbDir = () => dbRoot();
