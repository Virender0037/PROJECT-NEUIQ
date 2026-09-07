# Backend Docs — Reading Order

The Catalyst backend for NeuIQ: a conversational layer over Zoho People, plus the store behind
on-demand dashboards.

**Status: designed, not built.** `backend/` holds the directory structure and nothing else. These
documents are the specification it will be built against.

---

## Read in this order

### Understand the shape

| # | Doc | Why |
| - | --- | --- |
| [00](00-overview.md) | Overview | The goal and the request flow in ten lines |
| [01](01-scope.md) | Scope | What the first POC does and explicitly does not |
| [02](02-architecture.md) | Architecture | The one diagram worth memorising |
| [03](03-project-structure.md) | Project structure | Where code goes, and why each folder exists |

### The moving parts

| # | Doc | Why |
| - | --- | --- |
| [04](04-orchestrator.md) | Orchestrator | Intent → tool → answer, and the guardrails on it |
| [05](05-zoho-people-integration.md) | Zoho People integration | The client, the tools, the endpoint map |
| [06](06-auth-token-lifecycle.md) | OAuth / token lifecycle | App → Zoho. **Not** user → app |
| [07](07-rate-limiting.md) | Rate limiting | Treated as configuration, never a hardcoded number |
| [08](08-cache.md) | Cache | What may go stale, and what must not |
| [09](09-api-contract.md) | API contract | The client-facing shape |
| [15](15-dashboards.md) | **On-demand dashboards** | Storage, the query DSL, the sanitize whitelist |

### Operating it

| # | Doc | Why |
| - | --- | --- |
| [10](10-errors-observability.md) | Errors and observability | What to log, and what must never be logged |
| [11](11-testing.md) | Testing | Unit, integration, and the eval suite |
| [12](12-implementation-roadmap.md) | Roadmap | Phase order |
| [13](13-future-multi-service.md) | Multi-service | Adding Zoho CRM later without rewriting People |
| [14](14-deployment-checklist.md) | Deployment checklist | Before it goes anywhere real |

---

## The four rules everything else follows

**1. The LLM never invents business data.**
It selects a tool and its parameters. The tool fetches the numbers. Retrieved Zoho data is the
source of truth and the model formats it, nothing more.

**2. Retrieved data is data, never instructions.**
Leave reasons, comments and name fields are free text an employee can type into, and that text
lands in the prompt. Tool output is quoted, never obeyed. `transformers/` whitelists fields
before anything reaches Gemini — a raw employee record carries PII no prompt needs.

**3. The DSL is a menu, not a parser.**
Dashboards run against a read-only query engine over a fixed source registry. Every field name
that reaches the data layer must already appear in that registry. No SQL, no ZCQL, no write path
— so there is nothing to inject and nothing here can change data.

**4. Authorization is re-checked on every read, never at build time.**
A widget stores the question, not the answer. A stored number has already escaped whoever's
permissions produced it. See [15](15-dashboards.md).

---

## Two open blockers

Neither is a coding task, and the design cannot be finished without them.

### `16-identity-authorization.md` — unwritten

[06](06-auth-token-lifecycle.md) covers **app → Zoho** OAuth. Nothing covers **user → app**.

As currently designed, one service credential queries Zoho on everyone's behalf, so any caller of
`/api/v1/chat` could ask for any employee's leave balance, attendance or personal details. This is
HR data.

What the document has to define:

- how the caller is authenticated
- how a caller resolves to a Zoho employee record
- an authorization layer that scopes **every** tool call — self / my reports / HR-admin

It must sit **below** the orchestrator. The LLM must never be the thing deciding who may see what.

Every guarantee in [15](15-dashboards.md) rests on this. Until it exists, "scoped to the caller"
has no subject.

### No Zoho People sandbox

The tool catalogue is defined by what the client's org actually has — which modules are enabled,
their real leave types, whether attendance is on, any custom forms. Without access, the tools in
[05](05-zoho-people-integration.md) are educated guesses.

Also unverified and worth confirming early: the **data-centre trap** (a token minted on
`accounts.zoho.in` will not work against `.com` endpoints) and which of the several employee
identifiers each endpoint expects.

---

## What already exists to copy from

Two projects in this workspace have shipped versions of this idea. Neither is theoretical.

**`PROJECT-NEXGEN/apps/api/src/modules/`** — a NestJS implementation with an AI orchestrator,
tool registry, Gemini provider with a keyword fallback, AI permissions, and a read-only query
service. `dashboards/` and `ai/` are the direct references for [15](15-dashboards.md) and
[04](04-orchestrator.md).

**`PROJECT-BAJAJ/PROJECT-BAJAJ-CATALYST/asset-management/`** — the design system Hybrid borrows,
plus the original AI dashboard view this whole feature descends from.

When these docs and that code disagree, **the code is more likely to be right** — it has run.
