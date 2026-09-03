# Architecture

NeuIQ is a single-page React app with one central store and a flat set of screens.
There is no router; the current screen is a `view` string in the store, and the shell
swaps the matching page component.

## Data flow

```
main.jsx
  └─ <AppProvider>            ← all state + actions (React Context)
       └─ <App>               ← shell: <Sidebar/> + <main> + auth gate
            ├─ Sidebar        ← reads state, calls actions (go, newChat, loadConvo…)
            ├─ TopControls    ← floating incognito badge + chat actions
            ├─ <page>         ← the screen for the current `view`
            ├─ Composer       ← reads composer/streaming state, calls send/stop
            └─ Toasts         ← reads the toast queue
```

Every component pulls what it needs from `useApp()`. No prop-drilling; no local copies
of shared state. Screen-only state that never needs to be shared (e.g. the Tasks page's
checkbox toggles) lives in that screen with `useState`.

## The store — `src/context/AppContext.jsx`

A single provider holds all workspace state and exposes actions. Highlights:

- **Navigation** — `view` drives which page renders. `go(view)` also resets incognito
  appropriately; `newChat()`, `loadConvo()`, and `toggleIncognito()` are higher-level
  transitions that clear timers and messages.
- **Theming** — `theme` (`'light' | 'dark'`) is written to `data-theme` on the root by
  `App`. `cycleTheme()` and `setTheme()` change it; every color reads a CSS variable so
  the change is instant and global.
- **Streaming** — `send()` pushes a user message, shows the thinking pill for ~950ms,
  then reveals `answerFor(text)` a few characters per tick into `streamText`. `stop()`
  finalizes early. All timers are tracked in a ref and cleared on nav/unmount.
- **Auth gate** — `landing` and `authed` booleans decide whether the marketing hero,
  the auth screen, or the workspace is shown. `enterAuth`, `doAuth`, `logout` move
  between them.

## Rendering model

The screens are intentionally "dumb": they map data from `src/data/mockData.js` into
markup and wire clicks to store actions. To swap in a real API you only touch the store
(`send`/`answerFor`) and the data module — the screens are unaffected.

## Why no router / no CSS framework

- **No router** — the app is a workspace shell, not a set of deep-linkable documents.
  A `view` string is simpler and keeps everything in one place. Adding React Router
  later is straightforward: map routes to the same page components.
- **No CSS framework** — the design is token-driven. Semantic CSS variables plus the
  `<El>` primitive give exact control and instant theming without a utility layer.
