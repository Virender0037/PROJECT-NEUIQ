# On-Demand Dashboards

Describe a dashboard in words, get one built from live Zoho People data, save it, and have it
still be correct a month later.

This design is not speculative. It is the model running in **PROJECT-NEXGEN**
(`apps/api/src/modules/dashboards`), which is itself a descendant of the AI dashboard in
**PROJECT-BAJAJ / asset-management**. What follows is that design restated for Zoho People, with
the parts that earned their place called out.

## The one rule everything follows

**A widget stores the question, never the answer.**

```
persisted:  { type, title, query: { source, groupBy, metric, field, filter, sort, limit } }
NOT:        { type, title, value: "18.4k" }
```

Three consequences, in order of importance:

1. **Authorization is re-checked on every read.** A stored number has already escaped whoever's
   permissions produced it. A dashboard built by an HR admin and later opened by an employee must
   return that employee's rows — which is only possible if the query runs again, scoped to
   whoever is asking *now*.
2. **Figures stay current.** A pinned tile is a live question, not a screenshot.
3. **Cost is bounded by cache, not by storage.** Results go in Catalyst Cache under a per-widget
   TTL; the spec is the durable record.

## Storage

NexGen's table, which is the whole schema:

```sql
CREATE TABLE "Dashboard" (
  "id"        TEXT NOT NULL PRIMARY KEY,
  "ownerId"   TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "widgets"   JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "Dashboard_ownerId_idx" ON "Dashboard"("ownerId");
```

On Catalyst Data Store: indexed scalars for anything you filter on (`ownerId`), and the widget
array as a JSON text column. Deliberately not relational — the spec shape will change weekly
during the POC, and `specVersion` lets you migrate on read instead of running a schema change
every time.

**Ownership comes from the token on every path, never from a body or query field.** Every read
and write goes through the equivalent of NexGen's `mine(ownerId, id)`, which looks the row up by
`{ id, ownerId }` together. A dashboard you do not own is a 404, not a 403 — it should not even
confirm the id exists.

## The query DSL

The assistant gets broad read access through a constrained JSON DSL. It can filter, group and
aggregate any whitelisted column of any whitelisted source, but it **never emits SQL or ZCQL**,
so there is no injection surface and no write path.

```ts
QuerySpec = {
  source:   'leave' | 'attendance' | 'employees',
  groupBy?: string,            // must be in that source's `group` list
  metric?:  'count' | 'sum' | 'avg' | 'min' | 'max',
  field?:   string,            // must be in that source's `numeric` list
  filter?:  { field, op, value }[],   // op ∈ eq ne gt gte lt lte contains
  sort?:    'asc' | 'desc',
  limit?:   1..50,
}
```

Each source declares what may be asked of it:

| Source | Group by | Measures | Scope |
| ------ | -------- | -------- | ----- |
| `leave` | month, leaveType, status, departmentId | days | pinned to `employeeId` |
| `attendance` | month, status, departmentId | hours, lateMinutes | pinned to `employeeId` |
| `employees` | department, location, designation | tenureMonths | **admin only** |

Two details from NexGen worth copying verbatim:

- **`month` is a first-class groupBy.** Without it every grouping is categorical, so a line or
  area chart has no axis to run along and the model can only ever produce comparisons. It is the
  single grouping that makes "how are we trending" answerable.
- **A source whose scope function is `null` is admin-only, by construction.** If there is no way
  to pin its rows to one person, there is no way to show a safe slice of it, so it is refused for
  non-admins rather than filtered.

## `sanitize()` — the DSL is a menu, not a parser

Every field name that reaches the data layer must already appear in the source registry. This
runs on **both** directions of untrusted input: what the model emits, *and* what a client sends
on save. `widgets` is a JSON column, and a JSON column will otherwise store whatever it is handed
and hand it back to every future reader.

```
sanitize(raw):
  source unknown                  -> null   (drops the widget entirely)
  groupBy not in source.group     -> dropped
  field not in source.numeric     -> dropped
  metric not in METRICS           -> dropped
  op not in OPS                   -> coerced to 'eq'
  limit                           -> clamped to 1..50
  filter                          -> capped at 5 clauses
  metric != count with no field   -> demoted to count
```

That last line is a nice piece of honesty: a `sum` with no field is a count in disguise, so it
says so rather than silently summing nothing.

`cleanWidgets()` wraps it: an unrenderable widget type falls back to `bar` (a silent downgrade
beats a blank card), a widget whose query does not survive sanitising is dropped, and the array
is capped at 12.

## Scoping happens at read time

```
DISTRIBUTOR/EMPLOYEE query  ->  rewritten with a `where` pinning it to their own rows
                                BEFORE it runs
admin-only source, non-admin ->  ForbiddenException, not an empty result
```

Enforced in the query service, not the controller — **because the AI builder calls the same
method.** Putting it in the controller would leave the builder path unguarded, which is exactly
the path an attacker would use.

## The builder

`POST /api/v1/dashboards/build` — prompt in, widget spec out. **Nothing is saved here**; the
client previews first, and rendering live widgets in the preview means a bad spec shows up as an
empty chart rather than being discovered after it is in your list.

The system prompt hands the model `schemaFor(user)` — the source list, labels and field names for
*that caller*, never any rows. Three things NexGen's prompt does that are worth keeping:

- It tells the model **which chart fits which question** ("pie only for a share of one whole,
  and only with 2–6 slices; never for a ranking"), because a model left alone returns five bar
  charts.
- It explicitly asks it to **vary the types** — five defensible bar charts is a worse answer than
  a bar, a donut and a line.
- It caps output at **2–5 widgets** and forbids inventing a source or field name.

**Always ship the keyword fallback.** When Gemini is unconfigured or unreachable, a dumb
keyword matcher assembles the obvious chart for each noun it recognises. Better a plain dashboard
than an error where a dashboard was asked for.

And return `source` on the result so the UI can say **"built offline"** rather than passing the
fallback off as the model's work. Presenting one as the other is how users stop trusting both.

## API surface

```
GET    /api/v1/dashboards              list (own only)
POST   /api/v1/dashboards              save   { title, widgets }  -> re-sanitised
PATCH  /api/v1/dashboards/:id          rename / replace widgets
POST   /api/v1/dashboards/:id/duplicate
DELETE /api/v1/dashboards/:id
POST   /api/v1/dashboards/build        { prompt } -> { title, widgets, source }
POST   /api/v1/query                   { QuerySpec } -> { data: [{name,value,count}], meta }
```

`/query` is the resolve path and it is the hot one. On Catalyst:

- Cache key **must include the caller** — `widget:{id}:{resolvedPeriod}:{callerId}` — because the
  same spec legitimately returns different rows for different people. A cache keyed on the spec
  alone is a data leak.
- Resolve a dashboard's widgets in **one batched call** with a concurrency cap and a per-widget
  timeout, so one slow Zoho call degrades a single tile (`status: 'ok' | 'error' | 'stale'`)
  rather than failing the page. Catalyst's function timeout makes this mandatory, not nice.
- An empty rename is a **no-op**, not a dashboard called `""`.

## Client contract

`frontend/src/ui/hybrid/lib/dashboards.js` holds the same `SOURCES`, `sanitize()` and
`cleanWidgets()` for the Hybrid UI, with a local stand-in for the server. **Keep the two in
step** — they are one contract in two places until the backend exists. The client-side sanitise
is for fast feedback in Chart Builder, never a substitute for the server's.

## Open question this does not settle

Everything above assumes we know **who the caller is and which Zoho employee they map to**. That
is still unspecified — see `16-identity-authorization.md`, unwritten. Until it exists, "scoped to
the caller" has no subject, and every guarantee on this page rests on it.
