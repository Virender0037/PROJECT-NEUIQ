# NeuIQ — Frontend

React 18 single-page workspace. One codebase, **three UI styles** over one shared
state layer.

> Wired to the backend. Chat, the AI tab, Analytics and saved dashboards all call
> `http://localhost:4200/api/v1` — start it with `npm run dev` from the repo root, or
> run the UI alone and it falls back to local sample data, labelled as such. See
> [`docs/frontend/API-INTEGRATION.md`](../docs/frontend/API-INTEGRATION.md).

## Quick start

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # production build -> dist/
npm run preview
```

> **Heads-up on `npm install`:** `package.json` pins `vite@^8` while
> `@vitejs/plugin-react@^4` peers only up to vite 7, so a clean install fails
> `ERESOLVE`. The committed `package-lock.json` resolves fine and the build works.
> Until the versions are reconciled, use `npm install --legacy-peer-deps`.
> Proper fix: move to `@vitejs/plugin-react@^5` (or `@vitejs/plugin-react-oxc`).

## The three UI styles

Each style owns its **shell, presentation components and design tokens**. All three
read the same state from `AppProvider`, so the product logic is written once.

| Style | Directory | State |
| ----- | --------- | ----- |
| **Classic** | `src/ui/classic/` | The original prototype — 11 screens, working |
| **Hybrid** | `src/ui/hybrid/` | Data-workspace shell + 7 themes, ported from the asset-management design system |
| **Modern** | `src/ui/modern/` | Stub, awaiting the prototype |

`src/App.jsx` picks one, and it resolves in this order:

1. `?ui=hybrid` in the URL — linkable, no code change needed
2. the last choice, remembered in `localStorage`
3. `CONFIG.uiStyle` in `src/shared/context/AppContext.jsx`

The Hybrid appearance menu (palette icon, top right) switches between all three at runtime.

### Hybrid

Its design system is vendored from `PROJECT-BAJAJ/.../asset-management` — `styles/global.css`
is **byte-for-byte as copied** so it can be re-synced when that project's design system moves.
NeuIQ-only rules live beside it in `styles/neuiq.css`, loaded after.

Seven themes ride on two axes: `data-theme` (light/dark/mono/aqua) picks the component rules
and `data-variant` (dim/mono/aqua) re-tints the base tokens — so dim, mono-dark and aqua-dark
reuse every dark rule rather than duplicating it. Four accents sit on `data-accent`. All of it
is Hybrid-local state, because flattening it into shared state would cost five themes.

Two deliberate omissions from the source app: **Font Awesome** (the shared `<Icon>` set already
covers every glyph these screens need, and it saves a CDN dependency) and **recharts** (~500KB
for the one bar chart on Overview, which plain divs draw fine — add it when a screen needs a
real chart type).

Adding a style means: an `index.jsx` shell, a `components/` + `pages/` tree, a
`styles/` stylesheet imported by that shell (so it loads only while that style is
active), and one line in `UI_STYLES`. Nothing outside `src/ui/<style>/` changes.

## Structure

```
frontend/
├─ index.html                  # font links + #root
├─ vite.config.js              # @shared and @ui path aliases
├─ jsconfig.json               # same aliases, for the editor
└─ src/
   ├─ main.jsx                 # React root + <BrowserRouter> + <AppProvider>
   ├─ App.jsx                  # lazy-selects the UI style
   ├─ shared/                  # style-agnostic — used by all three UIs
   │  ├─ context/AppContext.jsx   # all app state + actions
   │  ├─ lib/routes.js            # view key <-> URL, the one route table
   │  ├─ data/mockData.js         # demo content (swap for the API client)
   │  ├─ lib/style.js             # css() string -> style-object parser
   │  ├─ components/El.jsx        # styling primitive (Classic's idiom)
   │  └─ icons/                   # Icon, Logo, iconPaths (Lucide geometry)
   └─ ui/
      ├─ classic/
      │  ├─ index.jsx          # shell: sidebar + main column, auth gate
      │  ├─ components/        # Sidebar, TopControls, Composer, ChatMessage, Toasts
      │  ├─ pages/             # the 11 screens
      │  └─ styles/theme.css   # Classic's tokens
      ├─ hybrid/
      │  ├─ index.jsx          # shell: floating dock + inset main pane, 7-theme wiring
      │  ├─ components/        # Dock, TopBar, Composer, ChatMessage, Widget, Toasts
      │  ├─ lib/               # nav.js (dock model + themes), dashboards.js (widget contract)
      │  ├─ pages/             # the same 11 screens, restyled
      │  └─ styles/            # global.css (vendored) + neuiq.css (ours)
      └─ modern/index.jsx      # stub
```

## Routing

The URL owns the current screen. `src/shared/lib/routes.js` maps each `view` key to a path, so
every existing `app.go('dashboard')` call and every `app.view` read keeps working while deep
links, back/forward and refresh-in-place all behave. `empty` and `chat` share `/chat` — they
were never two destinations, only "does this conversation have messages yet".

Import across the boundary with the aliases — never with `../../../`:

```js
import { useApp } from '@shared/context/AppContext.jsx';
import El from '@shared/components/El.jsx';
```

### What counts as `shared/`

State, data, and zero-opinion primitives — anything a redesign would not touch.
Layout, spacing, color and component chrome belong to a style. `AppContext` is
shared today but still holds a few Classic-only fields (`sidebarWidth`, `projTab`,
`pgTab`, `histFilter`, `rowMenu`); those get separated once the other two
prototypes show what they actually need. Deliberately **not** abstracted early —
premature sharing is harder to unpick than duplication.

## Configuration

`CONFIG` in `src/shared/context/AppContext.jsx`:

```js
export const CONFIG = {
  uiStyle: 'classic',      // 'classic' | 'modern' | 'hybrid'
  defaultTheme: 'light',   // 'light' | 'dark'
  accent: null,            // '#hex' to override the theme accent, or null
  greetingName: 'Alex',
  density: 'comfortable',  // 'comfortable' | 'compact'
};
```

## Features (Classic)

- **Two themes** — semantic CSS variables switched via `data-theme`, so it's instant
  and global.
- **Collapsible + resizable sidebar** — `⌘/Ctrl-B`, drag to 220–440px, icon rail
  with tooltips when collapsed.
- **Incognito mode** — hides history, forces dark, keeps the chat off the sidebar.
- **Streaming assistant** — thinking pill, then a word-by-word reveal; send becomes stop.
- **Compact mode**, **keyboard shortcuts** (`⌘N`, `⌘K`, `⌘B`), **reduced-motion support**.

## The backend

Chat posts to `POST /api/v1/chat`; widgets resolve against `POST /api/v1/query`; the AI tab reads
`GET /api/v1/ai/capabilities`; dashboards are real CRUD. Sign-in hits `POST /api/v1/auth/login`,
and **which seeded account you pick changes every number in the app** — the sign-in screen lists
them with their roles.

Run the API from the repo root with `npm run dev`, which starts both. Without it the UI still
works end to end on local sample data, labelled `sample` wherever it appears.

The full map of screen → endpoint, the rules the offline fallback follows, and how to add an
endpoint: [`docs/frontend/API-INTEGRATION.md`](../docs/frontend/API-INTEGRATION.md).

Still mock, deliberately: the **Overview** screen. Those figures are telemetry about *using*
NeuIQ (chats, streaks, messages), not Zoho People data, and no event pipeline exists for them yet.

## Docs

[`docs/frontend/ARCHITECTURE.md`](../docs/frontend/ARCHITECTURE.md) ·
[`COMPONENTS.md`](../docs/frontend/COMPONENTS.md) ·
[`THEMING.md`](../docs/frontend/THEMING.md) — all currently describe the Classic UI.
