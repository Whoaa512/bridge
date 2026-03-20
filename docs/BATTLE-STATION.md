# Bridge Battle Station — Plan

> Evolve Bridge from read-only project viewer → main dev battle station for coordinating agents and managing complexity at scale.

## Vision

You sit down. Open Bridge. See every project, every active agent, every branch. Start a pi session against any project. Watch complexity grow in real time as agents work. Triage what needs attention. This is where you do work.

### Design Principles

- **Portfolio-shaped, not repo-shaped.** Bridge shapes itself around your entire portfolio of codebases, not a single repo. Old IDEs: open repo → IDE shapes around it. Bridge: open Bridge → see everything.
- **Hackable and forkable.** Like pi, like t3's tools — Bridge should be the kind of project people fork and make their own. The next VS Code or Sublime, but bigger and better.
- **Agents are first-class.** The reason this tool exists is agents. You kick off work on project A, switch to B, start another agent on C. Bridge shows all of them, their status, what needs attention.
- **Fractal zoom (long-term).** The spatial canvas is the foundation for a deeper navigation model: zoomed out = all projects → zoom into a project = branches/agents/complexity → zoom into a branch = diff/session. Not MVP, but core to the long-term vision.

## Architecture

### Pi Integration: RPC Subprocess

Bridge spawns `pi --mode rpc` as child processes. Each session is an isolated pi process communicating via JSON lines over stdio.

Why RPC over embedded SDK (OpenClaw-style):
- Simpler. Pi is a black box — we don't need custom tools, auth rotation, or sandbox integration.
- No dependency tree coupling. Bridge doesn't need to match pi's npm packages.
- Process isolation. A crashed pi session doesn't take down Bridge.
- Pi's RPC protocol is already feature-complete: prompt, steer, follow_up, abort, get_state, get_messages, set_model, compact, bash, etc.

We vendor pi's RPC types into Bridge in two forms:
- **Go structs** in `scan/agent/` — for the Go server to parse/emit RPC JSON lines
- **TypeScript interfaces** in `web/src/agent/types.ts` — for the browser to type WS payloads (agent events, tool calls, etc.)

Both are derived from pi-mono's `modes/rpc/rpc-types.ts` + `agent-events.ts`. Integration tests validate vendored types against fresh pi-mono builds.

### Session Tracking: Active Run Map

The Go server manages sessions directly (no separate sidecar process):

```go
type SessionHandle struct {
    Process   *exec.Cmd
    Stdin     io.WriteCloser
    Cwd       string
    ProjectID string
    State     string // "idle" | "streaming" | "compacting"
}

var sessions = map[string]*SessionHandle{}
```

`projectId` maps to the project's `id` field in bridge-spec.json. When creating a session, the browser sends `projectId` alongside `cwd` so the Sessions view can show "pi session against treeline" without reverse-lookups.

Features:
- **Steer or queue**: User chooses per-message. Steer interrupts active stream, follow_up buffers until completion.
- Abort running sessions
- Track streaming/idle/compacting state per session
- Clean up on process crash
- Waiters for drain on shutdown
- **Extension UI relay**: Forward pi's `extension_ui_request` events to browser, relay user responses back

### WebSocket: Single Multiplexed Connection

One WebSocket from browser → Go server. Go manages everything directly.

```
Browser ←──WS──→ Go Server (:7400)
                     │
              /ws endpoint
              multiplexes:
              - spec events (full_sync, project_update)
              - agent events (pi_event, pi_response, session_*)
              
              Go spawns pi child processes directly,
              relays JSON lines ↔ WS messages
```

Why single WS:
- Simpler for browser (one connection, one reconnect handler)
- Go already has WebSocket infrastructure
- No separate sidecar process — Go manages pi children directly

Protocol:

```jsonc
// Spec events (existing, unchanged)
{"type": "full_sync", "spec": {...}}
{"type": "project_update", "id": "...", "data": {...}}

// Agent commands (browser → server)
{"type": "session_create", "id": "req_1", "cwd": "/path", "model": "sonnet", "projectId": "treeline"}
{"type": "session_destroy", "id": "req_2", "sessionId": "abc123"}
{"type": "sessions_list_request", "id": "req_3"}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "prompt", "message": "..."}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "steer", "message": "..."}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "follow_up", "message": "..."}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "abort"}}
{"type": "extension_ui_response", "sessionId": "abc123", "requestId": "ext_1", "response": {...}}

// Agent events (server → browser)
{"type": "session_created", "id": "req_1", "sessionId": "abc123"}
{"type": "session_destroyed", "id": "req_2"}
{"type": "session_error", "sessionId": "abc123", "code": "process_crashed" | "invalid_cwd" | "spawn_failed", "error": "..."}
{"type": "pi_event", "sessionId": "abc123", "event": {/* AgentEvent */}}
{"type": "pi_response", "sessionId": "abc123", "response": {/* RpcResponse */}}
{"type": "sessions_list", "id": "req_3", "sessions": [{...}]}
{"type": "extension_ui_request", "sessionId": "abc123", "requestId": "ext_1", "uiType": "select" | "confirm" | "input" | "editor", "data": {...}}

// Server lifecycle events
{"type": "server_status", "agentReady": true}
```

**Message semantics when streaming**: The UI presents both options to the user:
- **Steer** (interrupt): `pi_command` with `{"type": "steer"}` — injects into the active stream immediately
- **Follow-up** (after): `pi_command` with `{"type": "follow_up"}` — queued by Go server, sent after current stream completes

The composer shows a toggle or modifier key (e.g., Shift+Enter = steer, Enter = queue follow-up) so the user decides intent per-message.

### Session Management in Go

Go server manages pi sessions directly — no separate sidecar process.

- `bridge serve` starts the Go server which handles HTTP, WS, scanning, AND agent sessions
- Session creation: Go spawns `pi --mode rpc` as child process, pipes stdin/stdout as JSON lines
- Session state tracked in memory via `map[string]*SessionHandle`
- Process crash handling: detect child process exit, emit `session_error`, cleanup map
- Session manifest: write `~/.bridge/sessions/active.json` on session create/destroy (for crash recovery)
- Drain/shutdown: SIGTERM children, wait for active sessions
- Pi API keys: pi child processes inherit env from `bridge serve`

Why no sidecar:
- Go is excellent at child process management (`exec.Command`)
- Single binary, single process — drastically simpler ops
- No unix socket, no health checks, no crash recovery for sidecar itself
- JSON lines parsing in Go is trivial (`bufio.Scanner` + `json.Unmarshal`)

### Pi Import: Vendored Types + Integration Tests

**Go types** in `scan/agent/pitypes/`:
- Go structs mirroring pi's RPC command/response/event types
- JSON lines reader/writer

**Browser types** in `web/src/agent/types.ts`:
- TypeScript interfaces for `AgentEvent`, `RpcResponse`, etc.
- Used by Sessions view to type and render WS payloads

**Not vendored**: RpcClient class. Go implements its own thin process manager since it needs different lifecycle semantics (multi-session, WS relay).

**Pi session persistence**: Let pi persist sessions normally (default behavior). Configurable via `~/.bridge/config.json`:
- `sessionPersist: true` (default) — pi uses its default session directory
- `sessionPersist: false` — pass `--no-session` to pi
- `sessionDir: "/custom/path"` — pass `--session-dir` to pi

The Go server also maintains a lightweight manifest at `~/.bridge/sessions/active.json` mapping session IDs → cwd/model/pi-session-id, used for crash recovery.

Integration test strategy:
- `scan/agent/pitypes/compat_test.go` — spawns `pi --mode rpc`, validates Go structs match actual protocol
- Env var `PI_MONO_PATH` overrides pi-mono location (default: `~/code/pi-mono`)
- Skipped if pi binary not found (CI-friendly)

## Web UI Architecture

### View System

4 tabs, URL-routed:

| View | Renderer | Purpose |
|---|---|---|
| **Complexity** | Canvas2D (existing) | Explore codebase complexity treemap |
| **Workspace** | React | World state: branches, agents, activity, attention bar |
| **Colony** | Canvas2D (existing, enhanced) | Full colony map of all projects |
| **Sessions** | React | Active agent sessions, chat, composer |

### React Integration

React owns `#app` root. Canvas overlays on top for treemap views.

```html
<body>
  <canvas id="colony" />      <!-- always present, visibility toggled -->
  <div id="app" />            <!-- React root -->
</body>
```

- Canvas views (Complexity, Colony): React renders tab bar only, canvas visible + interactive
- Panel views (Workspace, Sessions): canvas hidden, React renders full panel
- Shared state via zustand store
- Canvas state (camera, hover) stays in vanilla TS

### Tech Stack Additions

**web/** (new deps):
- `react`, `react-dom` — UI framework
- `react-markdown` — agent response rendering (Phase 3)
- `zustand` — state management

**scan/agent/** (new Go package):
- Pi RPC type definitions (Go structs)
- Session manager (process spawning, JSON lines relay)
- JSON lines reader/writer

## Implementation Phases

### Phase 1: React Shell + View System ✅

**Goal**: Tab bar, view routing, existing treemap preserved.

**Status**: Complete (12 commits, 90 tests, 0 lint errors)

1. ✅ Add React + react-dom + zustand to web/
2. ✅ Configure Vite for TSX + WS proxy (`/ws` → `ws://localhost:7400/ws`)
3. ✅ `App.tsx` with tab bar (`1-4` keyboard shortcuts)
4. ✅ URL routing: `/` Complexity, `/workspace` Workspace, `/colony` Colony, `/sessions` Sessions
5. ✅ Canvas visibility toggled by view
6. ✅ Refactor main.ts into imperative canvas module:
   - `initCanvas(el: HTMLCanvasElement): CanvasHandle` in `web/src/canvas/bridge.ts`
   - `CanvasHandle` exposes: `destroy()`, `setVisible(bool)`, `updateSpec(spec)`
   - Render loop stays in vanilla TS, `main.tsx` calls init + wires to store
   - Zustand store holds spec + WS connection; `main.tsx` bridges store → canvas
   - Camera/hover/drag state stays internal to canvas module (not in zustand)
7. ✅ Placeholder content for Workspace/Sessions

**Implementation decisions made during Phase 1:**

- **No react-router**: Hand-rolled 19-line router (`router.ts`) using `pushState`/`popstate`. Minimal, no deps.
- **AbortController for cleanup**: All canvas event listeners use a single AbortController signal. `destroy()` calls `abort()` — one call cleans everything.
- **Data flow**: `main.tsx` owns initial `loadSpec()` + WS connection. Pushes to both zustand store and canvas handle. Eliminated a data race where bridge.ts was doing its own HTTP fetch that could be overwritten by WS.
- **HMR cleanup**: `import.meta.hot.dispose()` tears down WS + canvas on hot reload.
- **Complexity = Colony (for now)**: Both canvas views render the same treemap. Colony distinction deferred to Phase 4.
- **Render loop always runs**: Starts on `initCanvas()`, renders empty frame until `updateSpec()` provides data. Simpler than conditional start.

**Known tech debt to address later:**
- Drawer (`ui/drawer.ts`) is vanilla DOM — writes to `#ui-root`. Could conflict with React panels if opened on non-canvas views. Needs either React migration or guard to canvas-only views.
- `showError`/`showLoading`/`showEmpty` are also vanilla DOM in `main.tsx`. Should move to React store-driven rendering eventually.
- Keyboard handlers: bridge.ts registers WASD/arrows on `window`, App.tsx registers 1-4. No conflict today but fragile if more shortcuts added.

**Ships**: Working tab navigation, treemap unchanged.

### Phase 2a: Go Session Manager + Bidirectional WS

**Goal**: Go server can spawn pi sessions, relay commands/events over WS.

**Prerequisite from Phase 1**: `connectWS` in `web/src/core/ws.ts` is currently read-only (only parses `full_sync`). This phase adds a `send(msg)` method to the WS handle so the browser can send `session_create`, `pi_command`, etc.

1. Define Go RPC types in `scan/agent/pitypes/` mirroring pi's `rpc-types.ts`
2. JSON lines reader/writer for Go (stdin/stdout pipe to pi child process)
3. Session manager: `map[string]*SessionHandle` with spawn/destroy/send
4. Spawn `pi --mode rpc` per session, relay JSON lines to/from process
5. **Make Go WS handler bidirectional**: parse incoming JSON commands from browser, route agent commands to session manager
6. Go generates session IDs (UUID) for `session_create`
7. Handle: `session_create`, `session_destroy`, `pi_command`, `sessions_list_request`
8. Forward pi events back to browser as `pi_event` WS messages
9. Vendor pi's TS event types into `web/src/agent/types.ts` for browser use
10. Add `send()` method to `connectWS` return value in `web/src/core/ws.ts`
11. Add zustand store fields for sessions
12. Process crash handling: detect child exit, emit `session_error`, cleanup map
13. Integration test: spawn `pi --mode rpc`, validate Go types match protocol

**Ships**: Programmatic pi session creation/destruction from browser.

### Phase 2b: Session Lifecycle + Resilience

**Goal**: Production-grade session management.

1. Session manifest: write `~/.bridge/sessions/active.json` on create/destroy
2. Crash recovery on server restart: read manifest, attempt to resume sessions
3. Drain/shutdown: SIGTERM children, wait for active sessions, timeout
4. Graceful handling of pi process OOM/crash mid-stream
5. Session timeout: configurable idle timeout, cleanup stale sessions
6. Stress test: multiple concurrent sessions, rapid create/destroy

**Ships**: Resilient session management that survives restarts.

### Phase 3: Sessions View + Chat

**Goal**: Send prompts, see streamed responses, abort, extension UI support.

1. `SessionsView` React component: session sidebar + chat area
2. Session list: active sessions with cwd, model, state badge
3. "New Session" button: pick project from spec, create session
4. Chat area: scrollable messages (user + agent)
5. Composer: text input, Enter to send (follow_up when streaming), Shift+Enter to steer (interrupt)
6. Esc to abort running session
7. Markdown rendering for responses
8. Tool call display: collapsible name + args (read, bash, edit, write)
9. Streaming: `text_delta` events append in real time
10. State indicator: model name, thinking level, idle/streaming
11. Multiple sessions: switch between active sessions in sidebar
12. **Extension UI dialogs**: Render pi's extension_ui_request as modal overlays (select, confirm, input, editor). Relay user response back via extension_ui_response.

**Ships**: Functional agent chat from Bridge with full extension support.

### Phase 4: Workspace View

**Goal**: World state dashboard, branch-dashboard replacement.

1. Extend Go scanner: branch list, PR data per project
2. `WorkspaceView` React component:
   - Attention bar (items needing action)
   - Stats bar (projects, branches, PRs, active agents)
   - Project cards with branches, PRs, agent status
3. Search + filter pills (All, Has PRs, Active Agents, Stale)
4. Pi session status from Go server (sessions_list query)
5. Click project card → start session against it

**Ships**: Full workspace awareness, branch-dashboard replaced.

## Project Scope

Default watched projects (in `~/.bridge/config.json`):
- `~/code/bridge`
- `~/work/twig*`, `~/work/ergo*`
- `~/work/cj`
- `~/dotfiles`

## Success Criteria

After Phase 3:
- [ ] Switch to Sessions tab, create pi session against any project
- [ ] Send prompts, see streamed responses with markdown
- [ ] Abort running agent
- [ ] Multiple simultaneous sessions
- [ ] Treemap works exactly as before
- [ ] `bridge serve` starts scanner + web + agent session manager

After Phase 4:
- [ ] Workspace view shows branches, PRs, agent status
- [ ] Search and filter projects
- [ ] Attention bar surfaces items needing action

## Non-Goals (this milestone)

- Diff panel (future)
- Git operations from Bridge (future)
- Session history / resume UI (future — pi persists sessions to disk, recovery is handled on server restart)
- Sound effects (M4b per original plan)
- Embedded pi SDK (RPC is sufficient for now)
- Custom tool injection (pi's default tools are fine)
- Embedded browser panel for dev servers / PR review / docs (future milestone — Theo/Zellij direction)
- Fractal zoom navigation (long-term vision — Colony → project → branch → session drill-down)
- Configurable home view (default tab selection — future)

## Resolved Decisions

| Question | Decision | Rationale |
|---|---|---|
| Pi integration | RPC subprocess | Simpler, isolated, no dependency coupling |
| Session tracking | Active run map with handles | Need queue/abort/state per session (OpenClaw pattern) |
| WebSocket | Single multiplexed | Simpler for browser, Go proxies internally |
| Pi import | Vendor types + integration tests | Decoupled, testable against fresh pi builds |
| Sidecar launch | ~~Go spawns Node child~~ → Go-native, no sidecar | Single binary, no unix socket/health checks. Drastically simpler. |
| Go ↔ Node wire format | ~~JSON lines over unix socket~~ → N/A, all in-process | No sidecar means no IPC needed |
| Session ID ownership | Go server generates UUID | Central authority, avoids race conditions |
| Queue semantics | User chooses: steer (interrupt) vs follow_up (queue) | Both are valid intents — let user decide per-message |
| Max sessions | No limit | Single-user tool, trust the user |
| Extension UI | Relay to browser as modal dialogs | Proper support, extensions work correctly |
| Pi session persistence | Persist by default, configurable off | Free resume later, `~/.bridge/config.json` controls it |
| ~~Sidecar crash recovery~~ | N/A — no sidecar. Pi child crash = session_error + cleanup | Single process model, pi crashes are per-session |
| Session management runtime | Go-native (no Node/Bun sidecar) | Single binary, Go is great at child procs, no IPC overhead |
| Pi types vendoring | Go structs in scan/ + TS interfaces in web/ | Both sides need types; Go for server, TS for browser rendering |
| Phase 2 split | 2a (core session CRUD + WS) then 2b (resilience) | Manageable scope per phase |
| Colony vs Complexity | Differentiate now: Colony = all projects, Complexity = filtered | Avoid confusing duplicate views |
| Home view / Colony as nav | 4 equal tabs, home configurable later | Colony nav hub is long-term, not MVP |
| Fractal zoom | Long-term vision, not MVP | Core to thesis but defer until nav/chat/workspace solid |
| Web framework | React via Vite | Panel views need component model, canvas stays vanilla |
| Pi API keys | Pi child processes inherit env from `bridge serve` | Simplest, no separate auth config |
| URL routing | Hand-rolled pushState, no react-router | 19 lines, no dep, sufficient for 4 views |
| Event listener cleanup | AbortController signal on all listeners | Single `abort()` tears down everything |
| Canvas data flow | `main.tsx` owns HTTP + WS, bridges to canvas | Eliminates race between HTTP fetch and WS updates |
| Canvas render loop | Always running, renders empty until spec arrives | Simpler than conditional start/stop |
