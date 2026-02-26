# Launch — Developer Launcher UI

## The Problem

Day-to-day frontend development involves a lot of repetitive setup:

- Manually `cd`-ing into project directories
- Remembering which command starts which project (`npm run dev`, `dotnet run`, `ng serve`, etc.)
- Switching between multiple projects means opening several terminals and repeating the above
- Navigating to related web pages (e.g. a CMS like Umbraco, staging URLs, dashboards) requires either bookmarks or memorised URLs — there's no single place for all of this

This context-switching overhead adds up. It pulls focus away from actual development.

---

## The Goal

A **personal developer launcher** — a lightweight local web UI that lives in the browser and acts as a control panel for the development environment. From one place:

- Launch any configured project with a single click
- Run multiple projects simultaneously, each with its own live terminal output
- Stop running projects
- Navigate to related web pages or environments (CMS, staging, etc.)
- Configure everything through the UI, which persists to a config file

---

## Solution Overview

### Architecture

```
Browser (React + TypeScript UI)
        ↕  WebSocket + REST
Node.js Backend (Express)
        ↕  child_process / pty
Terminal processes (npm run dev, dotnet run, etc.)
```

A **Node.js/Express backend** runs locally and is responsible for:
- Spawning and managing child processes (dev servers, build watchers, etc.)
- Streaming stdout/stderr back to the browser over **WebSockets**
- Reading and writing the config file (`launch.config.json`)

The **React + TypeScript frontend** runs in the browser and provides the UI. It communicates with the backend over localhost.

---

## Feature Plan

### Phase 1 — Core Launcher

- [ ] Project cards — each project shows its name, directory, and start command
- [ ] Start / Stop buttons per project
- [ ] Status indicator (stopped / starting / running / errored)
- [ ] Live terminal output panel per project (WebSocket stream)
- [ ] Run multiple projects simultaneously

### Phase 2 — Navigation Links

- [ ] Quick-link cards for URLs (e.g. Umbraco, staging, local ports)
- [ ] Per-link setting: open in **default browser** or **embedded webview** (iframe)
- [ ] Toggle in a settings panel to change this preference after creation

### Phase 3 — Configuration UI

- [ ] Settings screen to add / edit / remove projects
  - Fields: display name, working directory, start command, colour/icon
- [ ] Settings screen to add / edit / remove navigation links
  - Fields: label, URL, open mode (browser / webview)
- [ ] All changes persist to `launch.config.json` on disk
- [ ] Config file can also be edited directly — UI reloads on change

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| UI framework | React + TypeScript | Familiar, component-based |
| UI build | Vite | Fast dev server, minimal config |
| Styling | Tailwind CSS | Utility-first, quick to iterate |
| Backend | Node.js + Express | Lightweight, easy process spawning |
| Process I/O | `node-pty` | Proper PTY support, handles colour output |
| Real-time comms | `ws` (WebSockets) | Stream terminal output to the browser |
| Config persistence | JSON file (`launch.config.json`) | Human-readable, easy to back up or edit |

---

## Proposed Config Format

```json
{
  "projects": [
    {
      "id": "my-app",
      "name": "My React App",
      "cwd": "/Users/gijsbert/Code/my-app",
      "command": "npm run dev",
      "color": "#3B82F6"
    }
  ],
  "links": [
    {
      "id": "umbraco-local",
      "label": "Umbraco (local)",
      "url": "http://localhost:8080/umbraco",
      "openMode": "browser"
    },
    {
      "id": "staging",
      "label": "Staging site",
      "url": "https://staging.example.com",
      "openMode": "webview"
    }
  ]
}
```

---

## UI Sketch

The app is divided into three distinct **views**, each full-page, toggled by a navigation bar at the top.

### Shared navigation bar (always visible)

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 Launch        [ Projects ]  [ Links ]  [ Settings ]     │
└─────────────────────────────────────────────────────────────┘
```

The active view is highlighted in the nav. The nav bar is always present so switching views is instant from anywhere in the app.

---

### View 1 — Projects

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 Launch       [●Projects]   [ Links ]   [ Settings ]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ SLO-FE           │  │ HHNK             │                │
│  │ pnpm dev -p 3001 │  │ pnpm dev -p 3002 │                │
│  │ ● Running        │  │ ○ Stopped        │                │
│  │ [Stop] [↗ Open]  │  │ [Start]          │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
│  ┌──────────────────┐                                      │
│  │ WBVN-FE          │                                      │
│  │ pnpm dev -p 3003 │                                      │
│  │ ⚠ Errored        │                                      │
│  │ [Restart] [Logs] │                                      │
│  └──────────────────┘                                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  ▼ SLO-FE — live output                          [✕ close] │
│  > Next.js 15  ready in 892ms                               │
│  > Local:   http://localhost:3001                           │
│  > Network: http://192.168.1.5:3001                         │
└─────────────────────────────────────────────────────────────┘
```

Each project card shows:
- Name, command, working directory
- Status badge: `Stopped` / `Starting` / `Running` / `Errored`
- Start / Stop / Restart button (contextual)
- "Open" button — opens the project URL in browser (only shown while running)
- "Logs" toggle — expands the output panel at the bottom of the view

The output panel docks to the bottom and shows the selected project's live stream. Only one log panel is open at a time; clicking "Logs" on a different card switches the panel to that project.

---

### View 2 — Links

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 Launch        [ Projects ]  [●Links]   [ Settings ]     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │ Umbraco (local)  │  │ Staging site     │                │
│  │ localhost:8080   │  │ staging.example  │                │
│  │ 🔗 Browser       │  │ 🖥 Webview        │                │
│  └──────────────────┘  └──────────────────┘                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Each link card shows the label, URL, and open mode icon. Clicking a card opens the link immediately (no extra confirmation). The open mode (browser vs webview) is set per link in Settings.

---

### View 3 — Settings

```
┌─────────────────────────────────────────────────────────────┐
│  🚀 Launch        [ Projects ]  [ Links ]   [●Settings]     │
├─────────────────────────────────────────────────────────────┤
│  Projects                                    [+ Add]        │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  SLO-FE    /Code/SLO-FE   pnpm dev -p 3001   [Edit] [Del]  │
│  HHNK      /Code/HHNK     pnpm dev -p 3002   [Edit] [Del]  │
│  WBVN-FE   /Code/WBVN-FE  pnpm dev -p 3003   [Edit] [Del]  │
│                                                             │
│  Links                                       [+ Add]        │
│  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄  │
│  Umbraco   localhost:8080   [Browser ▾]  [Edit] [Del]       │
│  Staging   staging.example  [Webview  ▾]  [Edit] [Del]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

Settings is a single structured page (no sub-tabs). Projects and Links are each managed in their own section. Clicking "Edit" opens an inline form or modal. All changes are saved to `launch.config.json` immediately on confirm.

---

## Window / View Logic

The app uses a **single-page view model** — no URL routing is needed since this is a local tool, not a public website. View state is managed in a top-level React context (`ViewContext`).

### View state

```ts
type View = 'projects' | 'links' | 'settings';

// Held in ViewContext, accessible to all components
const [activeView, setActiveView] = useState<View>('projects');
```

The `<App />` root renders the nav bar unconditionally, then renders the active view component beneath it:

```
<App>
  <NavBar />                          ← always mounted
  {activeView === 'projects' && <ProjectsView />}
  {activeView === 'links'    && <LinksView />}
  {activeView === 'settings' && <SettingsView />}
</App>
```

Views are **conditionally rendered, not hidden with CSS** — this ensures that unmounted views do not hold stale WebSocket output or zombie refs. The Projects view is the default on load.

### Log panel state

The log panel lives inside `<ProjectsView />` and is controlled by a `selectedLogId: string | null` piece of state local to that view. It persists while the Projects view is mounted (i.e. navigating to Links and back restores the previously open log panel). The panel can be:

- **Closed** — `selectedLogId === null`, panel not rendered
- **Open** — `selectedLogId === '<project-id>'`, panel docked at bottom with live output

Switching the active log project does not disconnect the WebSocket for the previous project — all running projects maintain their own persistent WebSocket connection regardless of which log panel is visible.

### WebSocket connections

Each project's process stream is managed by a `useProjectStream(projectId)` custom hook. The hook:
1. Opens a WebSocket connection to `ws://localhost:4000/stream/<projectId>` when the project is first started
2. Buffers incoming log lines in a ref (not state, to avoid re-renders per line)
3. Flushes the buffer to state on a `requestAnimationFrame` loop for smooth rendering
4. Closes the connection when the project is stopped or the component unmounts

This means **log output is preserved in memory** even when the log panel is closed — reopening the panel replays the buffered lines instantly.

### Settings mutations

Settings edits go through a `useConfig()` hook that:
1. Sends a `PATCH /config` request to the backend
2. Optimistically updates local state immediately
3. Rolls back on error and shows a toast notification

The backend writes the updated config to `launch.config.json` on every mutation, keeping the file always in sync.

---

## Development Roadmap

1. **Scaffold** — Vite + React/TS frontend, Express backend, monorepo structure (`/client`, `/server`)
2. **Config** — Read/write `launch.config.json` via REST endpoints
3. **Process management** — Spawn/kill processes with `node-pty`, track state
4. **WebSocket streaming** — Pipe PTY output to connected browser clients
5. **UI — Projects** — Cards, start/stop, status indicators, log panels
6. **UI — Links** — Quick-link cards, browser vs webview toggle
7. **UI — Settings** — Forms to manage projects and links
8. **Polish** — Colour themes, notifications, error states, auto-scroll logs

---

## Known Projects

All projects are Next.js apps managed with `pnpm`, located one directory above this repo (`/Users/gijsbert/Code/`). Since they all default to port 3000, each is assigned a unique port so they can run simultaneously.

| Project | Path | Command | Dev URL |
|---|---|---|---|
| SLO-FE | `/Users/gijsbert/Code/SLO-FE` | `pnpm dev -p 3001` | http://localhost:3001 |
| HHNK | `/Users/gijsbert/Code/HHNK` | `pnpm dev -p 3002` | http://localhost:3002 |
| WBVN-FE | `/Users/gijsbert/Code/WBVN-FE` | `pnpm dev -p 3003` | http://localhost:3003 |
| SOON-FE | `/Users/gijsbert/Code/SOON-FE` | `pnpm dev -p 3004` | http://localhost:3004 |

> These are pre-loaded into `launch.config.json`. Ports can be changed via the settings UI.

---

## Open Questions / Future Ideas

- Should the app auto-start on login? (launchd / login item on macOS)
- Should it remember which projects were running and restore them on restart?
- Port conflicts — detect if a port is already in use before starting
- Keyboard shortcuts (e.g. `Cmd+1` to focus project 1)
- Import projects by scanning a root directory for known config files (`package.json`, `*.csproj`, etc.)
