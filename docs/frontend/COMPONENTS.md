# Component reference — Classic UI

> **Scope:** this document describes the **Classic UI** (`frontend/src/ui/classic/`), the original prototype. The Modern and Hybrid styles will get their own documents once their prototypes land.

## The `<El>` primitive — `frontend/src/shared/components/El.jsx`

`El` is the single styling building block. It renders any element and accepts the
design's raw CSS **strings**, keeping interactive states in JS:

```jsx
<El as="button"
    css="height:32px;padding:0 11px;background:var(--surface);border-radius:10px"
    hover="background:var(--hover)"
    active="transform:translateY(.5px)"
    focus="box-shadow:0 0 0 3px var(--ring)"
    onClick={fn}>
  New chat
</El>
```

- `css` — base styles, always applied
- `hover` / `active` / `focus` — merged while in that state (tracked with local state)
- `style` — a normal React style object, merged last (wins); use for dynamic values
- all other props (`onClick`, `title`, `type`, `value`, `data-*`, …) pass straight through

Strings are parsed by `lib/style.js → css()`, which converts `kebab-case` to camelCase,
handles vendor prefixes, and preserves CSS variables. This lets markup carry exact
declarations with no visual drift and no global stylesheet churn.

> Use plain elements with a `style` object when there are no interactive states; reach
> for `El` when you need hover/active/focus.

## Icons — `icons/Icon.jsx`, `icons/iconPaths.js`

`<Icon name="folder" size={18} />` renders a 24×24 SVG (1.6 stroke, round caps) from
the `ICONS` map. The geometry matches Lucide one-to-one, so you can swap in
`lucide-react` if you prefer the dependency. `filled` fills with `currentColor` (used
for the pinned star); `Logo.jsx` is the bespoke NeuIQ cube mark.

## Layout components

| Component      | Responsibility                                                                       |
| -------------- | ------------------------------------------------------------------------------------ |
| `App`          | Shell. Sidebar + main column, view switch, theme `data-theme`, landing/auth gate.    |
| `Sidebar`      | Brand, New chat, nav, projects, pinned, date-grouped history (with per-row ⋯ menu), search, profile, logout, collapse toggle, drag-resize handle. |
| `TopControls`  | Floating incognito badge (left) and Share / Export / More actions (right).           |
| `Composer`     | Auto-growing textarea; attach/tools/model/mic and a send button that becomes a voice waveform when empty and a stop square while streaming. |
| `Toasts`       | Bottom-center transient notifications from the store's toast queue.                  |

## Chat message components — `components/ChatMessage.jsx`

- `UserMessage` — right-aligned bubble (radius `16 16 4 16`).
- `AiMessage` — 30px avatar + block renderer (paragraph, h3, ul, ol, code, table) and a
  hover action row (Copy, Regenerate, Like, Dislike, Save).
- `ThinkingPill` — "Analyzing" with three pulsing dots.
- `StreamingMessage` — live text with a blinking caret.

## Pages — `frontend/src/ui/classic/pages/*`

One file per screen; each reads `mockData` and calls store actions. `Settings` also
exports a reusable `Toggle` switch. All pages are pure presentation — see
`ARCHITECTURE.md` for how they connect to state.
