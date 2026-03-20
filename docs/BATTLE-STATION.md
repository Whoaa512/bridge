# Bridge Battle Station — Plan

> Evolve Bridge from read-only project viewer → main dev battle station for coordinating agents and managing complexity at scale.

## Vision

You sit down. Open Bridge. See every project, every active agent, every branch. Start a pi session against any project. Watch complexity grow in real time as agents work. Triage what needs attention. This is where you do work.

## Architecture Decision: Node Sidecar for Pi

**Go server should NOT spawn pi (Node.js) processes directly.**

Reasons:
- Pi RPC is JSON lines over stdio — Go can parse this, but pi is a Node.js process with Node-specific lifecycle (extensions, IPC, signal handling)
- Pi ships an `RpcClient` class in TypeScript that handles all the stdio buffering, request correlation, and event parsing — rewriting this in Go is wasteful
- A Node sidecar can import `RpcClient` directly from pi-mono, getting type-safe access to the full protocol
- Go server stays lean: scanner + spec broadcaster. Node sidecar owns agent lifecycle.

```
┌─────────────────────────────────────────────────────┐
│                    Bridge Web UI                     │
│    React (panels/chat/tabs) + Canvas2D (treemap)     │
│    localhost:7400                                     │
└─────────────┬────────────────────┬──────────────────┘
              │ WS (spec)          │ WS (agent)
┌─────────────┴─────────┐  ┌──────┴──────────────────┐
│  Go Scanner Server     │  │  Node Agent Sidecar      │
│  :7400                 │  │  :7401                    │
│  - spec broadcast      │  │  - pi RpcClient per sess  │
│  - project discovery   │  │  - session lifecycle      │
│  - git/ci/infra scan   │  │  - WS relay to browser    │
└────────────────────────┘  └──────────────────────────┘
                                    │ stdio (JSON lines)
                              ┌─────┴─────┐
                              │  pi --rpc  │  (per session)
                              └───────────┘
```

**Alternative considered**: single Go server managing pi processes. Rejected because:
- Reimplements RpcClient in Go (200+ lines of typed protocol handling)
- Pi extensions/hooks expect Node environment
- Harder to debug stdio buffering issues across language boundary

**Alternative considered**: single Node server replacing Go. Rejected because:
- Go scanner is already built and working well
- Go is better for system scanning (ports, processes, Docker)
- Don't rewrite what works

## Web UI Architecture

### View System

4 tabs, URL-routed:

| View | Renderer | Purpose |
|---|---|---|
| **Complexity** | Canvas2D (existing) | Explore codebase complexity treemap |
| **Workspace** | React | World state: branches, agents, activity, attention bar |
| **Colony** | Canvas2D (existing, enhanced) | Full colony map of all projects |
| **Sessions** | React | Active agent sessions, chat, composer |

### React Integration Strategy

1. React owns a root div (`#app`). Canvas overlays on top for treemap views.
2. When Complexity/Colony view is active: React renders minimal chrome (tab bar, maybe sidebar), canvas is visible and interactive.
3. When Workspace/Sessions view is active: canvas hidden, React renders full panel.
4. Shared state via a simple store (zustand or vanilla context) — not Redux.
5. Canvas state (camera, hover, etc.) stays in vanilla TS — React doesn't touch it.

```html
<body>
  <canvas id="colony" />           <!-- always present, visibility toggled -->
  <div id="app" />                 <!-- React root -->
  <script type="module" src="/src/main.tsx" />
</body>
```

### WebSocket Protocol

Two WebSocket connections from browser:
1. **Spec WS** (`:7400/ws`) — existing, unchanged. `full_sync`, `project_update`, etc.
2. **Agent WS** (`:7401/ws`) — new, from Node sidecar.

Agent WS messages:

```jsonc
// Browser → Sidecar
{"type": "session_create", "id": "req_1", "cwd": "/Users/cj/code/bridge", "model": "sonnet"}
{"type": "session_destroy", "id": "req_2", "sessionId": "abc123"}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "prompt", "message": "fix the tests"}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "abort"}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "get_state"}}

// Sidecar → Browser
{"type": "session_created", "id": "req_1", "sessionId": "abc123"}
{"type": "session_destroyed", "id": "req_2", "sessionId": "abc123"}
{"type": "session_error", "id": "req_1", "error": "pi process crashed"}
{"type": "pi_event", "sessionId": "abc123", "event": { /* AgentEvent */ }}
{"type": "pi_response", "sessionId": "abc123", "response": { /* RpcResponse */ }}
{"type": "sessions_list", "sessions": [{"id": "abc123", "cwd": "...", "state": {...}}]}
```

## Implementation Plan

### Phase 1: React Shell + View System (no agent yet)

**Goal**: Tab bar working, can switch between views, existing treemap still works.

Steps:
1. Add React + react-dom to web package
2. Configure Vite for JSX/TSX
3. Create `App.tsx` with tab bar component
4. Route: `/` → Complexity, `/workspace` → Workspace, `/colony` → Colony, `/sessions` → Sessions
5. Canvas visibility toggled by active view
6. Existing canvas init code moved into a `useEffect` or imperative call
7. Workspace and Sessions views show placeholder content
8. Tab bar uses keyboard shortcut `1-4` for quick switching

**What ships**: Working tab navigation with existing treemap preserved. Placeholder views.

### Phase 2: Node Agent Sidecar

**Goal**: Node process that manages pi sessions, exposes WebSocket.

Steps:
1. Create `agent/` directory at repo root (sibling to `scan/` and `web/`)
2. TypeScript project: `bun` runtime, minimal deps
3. Import pi's `RpcClient` (or vendor a copy — see open question below)
4. WebSocket server on `:7401` using `ws` package (or Bun's built-in WS)
5. Session manager: `Map<string, { client: RpcClient, cwd: string }>`
6. Handle: `session_create` → spawn pi, `session_destroy` → kill pi, `pi_command` → forward to RpcClient
7. Forward all pi events back to browser as `pi_event` messages
8. Handle pi process crash: emit `session_error`, clean up map entry
9. `bridge serve` updated to also start the Node sidecar
10. Health check endpoint so Go server can verify sidecar is running

**What ships**: Programmatic pi session creation/destruction from the browser.

### Phase 3: Sessions View + Chat

**Goal**: Can send prompts, see streamed responses, abort.

Steps:
1. React component: `SessionsView` — sidebar list of sessions + main chat area
2. Session list: shows active sessions with cwd, model, state (idle/streaming/compacting)
3. "New Session" button: pick a project (from spec), creates session with that cwd
4. Chat area: scrollable message list (user messages + agent responses)
5. Composer: text input + send button + abort button
6. Markdown rendering for agent responses (use a lightweight lib: `react-markdown` or similar)
7. Tool call display: show tool name + args collapsible (read, bash, edit, write)
8. Streaming: `text_delta` events append to current response in real time
9. State indicator: model name, thinking level, idle/streaming badge
10. Keyboard: `Enter` to send, `Esc` to abort, `Cmd+N` new session

**What ships**: Functional agent chat. Can work from Bridge.

### Phase 4: Workspace View (branch-dashboard absorption)

**Goal**: See the state of the world across all projects.

Steps:
1. Extend Go scanner to collect branch info for configured repos
2. Scanner emits per-project branch list, PR data, agent session state
3. React `WorkspaceView` component:
   - Attention bar at top (items needing input)
   - Stats bar (projects, branches, PRs, active agents)
   - Project cards with branch info, PR status, agent status
4. Search + filter pills
5. Pi session status integrated (sidecar provides session list on request)
6. Clicking a project card → can start a session against it

**What ships**: Full workspace awareness. Branch-dashboard functionality in Bridge.

## Open Questions

1. **Pi RpcClient import**: Should the sidecar import from pi-mono directly (npm link / workspace), or vendor a copy of rpc-client.ts + dependencies? Vendoring is simpler for now, linking is cleaner long-term.

2. **Single vs dual WebSocket**: Could multiplex spec + agent events on one WS connection through the Go server (Go proxies to Node sidecar). Simpler for browser (one connection), more complex for Go server. Two connections is simpler to implement. **Recommendation: start with two, unify later if it matters.**

3. **Session persistence**: Should sessions survive Bridge restart? Pi sessions already persist to disk. Sidecar could re-attach on startup by scanning `~/.pi/agent/sessions/`. Defer to Phase 3+.

4. **Auth for WebSocket**: Currently no auth on WS. Fine for localhost. Flag for later if Bridge ever listens on non-loopback.

5. **Go server launching sidecar**: `bridge serve` should start both Go server and Node sidecar. Options: (a) Go spawns Node as child process, (b) shell script/Makefile runs both, (c) Go exec's both via goroutine. **Recommendation: (a) Go spawns Node, monitors health, restarts on crash.**

## Project Scope

Default watched projects (configurable in `~/.bridge/config.json`):
- `~/code/bridge`
- `~/work/twig*`, `~/work/ergo*`
- `~/work/cj`
- `~/dotfiles`

## Dependencies

### web/ (new additions)
- `react`, `react-dom` — UI framework for panels
- `react-markdown` — agent response rendering (or lighter alternative)
- `zustand` — state management (optional, can start with context)

### agent/ (new package)
- `ws` (or Bun built-in) — WebSocket server
- Pi RPC types (vendored or linked from pi-mono)

## Success Criteria

After Phase 3:
- [ ] Can open Bridge, switch to Sessions tab
- [ ] Can create a new pi session against any discovered project
- [ ] Can send prompts and see streamed responses
- [ ] Can abort a running agent
- [ ] Can have multiple sessions open simultaneously
- [ ] Treemap still works exactly as before
- [ ] `bridge serve` starts everything (scanner + web + agent sidecar)

After Phase 4:
- [ ] Workspace view shows branches, PRs, agent status across all projects
- [ ] Can search and filter projects
- [ ] Attention bar surfaces items needing action
- [ ] Branch-dashboard is fully replaced

## Non-Goals (this milestone)

- Diff panel (t3code feature — future)
- Branch toolbar / git operations from Bridge (future)
- Session history / resume (future, pi already persists sessions)
- Sound effects (M4b per original plan)
- Sidebar navigation (future — tab bar is sufficient for now)
