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

We vendor pi's RPC types + JSONL parser into Bridge (not the full RpcClient class — we reimplement the thin relay in our sidecar). Integration tests validate vendored types against fresh pi-mono builds.

### Session Tracking: Active Run Map

Inspired by OpenClaw's `runs.ts`, the sidecar maintains:

```typescript
type SessionHandle = {
  process: ChildProcess;
  cwd: string;
  projectId: string;
  state: "idle" | "streaming" | "compacting";
  abort: () => void;
  queueMessage: (text: string) => void;
};

const sessions = new Map<string, SessionHandle>();
```

`projectId` maps to the project's `id` field in bridge-spec.json. When creating a session, the browser sends `projectId` alongside `cwd` so the Sessions view can show "pi session against treeline" without reverse-lookups.

Features:
- **Steer or queue**: User chooses per-message. Steer interrupts active stream, follow_up buffers until completion.
- Abort running sessions
- Track streaming/idle/compacting state per session
- Clean up on process crash
- Waiters for drain on sidecar shutdown
- **Extension UI relay**: Forward pi's `extension_ui_request` events to browser, relay user responses back

### WebSocket: Single Multiplexed Connection

One WebSocket from browser → Go server. Go proxies agent messages to/from Node sidecar internally.

```
Browser ←──WS──→ Go Server (:7400) ←──internal──→ Node Sidecar
                     │
              /ws endpoint
              multiplexes:
              - spec events (full_sync, project_update)
              - agent events (pi_event, pi_response, session_*)
```

Why single WS:
- Simpler for browser (one connection, one reconnect handler)
- Go already has WebSocket infrastructure
- Internal communication (Go ↔ Node) can use unix socket or HTTP

Protocol:

```jsonc
// Spec events (existing, unchanged)
{"type": "full_sync", "spec": {...}}
{"type": "project_update", "id": "...", "data": {...}}

// Agent commands (browser → server → sidecar)
{"type": "session_create", "id": "req_1", "cwd": "/path", "model": "sonnet", "projectId": "treeline"}
{"type": "session_destroy", "id": "req_2", "sessionId": "abc123"}
{"type": "sessions_list_request", "id": "req_3"}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "prompt", "message": "..."}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "steer", "message": "..."}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "follow_up", "message": "..."}}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "abort"}}
{"type": "extension_ui_response", "sessionId": "abc123", "requestId": "ext_1", "response": {...}}

// Agent events (sidecar → server → browser)
{"type": "session_created", "id": "req_1", "sessionId": "abc123"}
{"type": "session_destroyed", "id": "req_2"}
{"type": "session_error", "sessionId": "abc123", "code": "process_crashed" | "invalid_cwd" | "spawn_failed", "error": "..."}
{"type": "pi_event", "sessionId": "abc123", "event": {/* AgentEvent */}}
{"type": "pi_response", "sessionId": "abc123", "response": {/* RpcResponse */}}
{"type": "sessions_list", "id": "req_3", "sessions": [{...}]}
{"type": "extension_ui_request", "sessionId": "abc123", "requestId": "ext_1", "uiType": "select" | "confirm" | "input" | "editor", "data": {...}}

// Sidecar lifecycle events
{"type": "sidecar_status", "status": "healthy" | "restarting"}
{"type": "sidecar_restarting", "sessions": ["abc123", "def456"]}
{"type": "session_recovered", "sessionId": "abc123"}
{"type": "session_lost", "sessionId": "abc123", "reason": "..."}
```

**Message semantics when streaming**: The UI presents both options to the user:
- **Steer** (interrupt): `pi_command` with `{"type": "steer"}` — injects into the active stream immediately
- **Follow-up** (after): `pi_command` with `{"type": "follow_up"}` — queued by sidecar, sent after current stream completes

The composer shows a toggle or modifier key (e.g., Shift+Enter = steer, Enter = queue follow-up) so the user decides intent per-message.

### Go ↔ Node Sidecar Communication

Go spawns Node sidecar as child process, monitors health, restarts on crash.

**Wire format**: JSON lines over unix socket at `~/.bridge/agent.sock`. Same framing as pi RPC — newline-delimited JSON. Go connects as client, sidecar listens.

Why unix socket: No port conflicts, fast, Go's `net.Dial("unix", ...)` is trivial. JSON lines keeps it consistent with pi's own protocol — one parser pattern everywhere.

**Session ID ownership**: Go server generates session IDs. Browser sends `session_create` request, Go mints a UUID, forwards to sidecar with the ID already assigned, returns `session_created` to browser. Central authority avoids race conditions.

**Health check**: Go sends `{"type": "ping"}` every 5s over the unix socket. Sidecar responds `{"type": "pong"}`. 3 missed pongs = restart. Health state surfaced to browser via `{"type": "sidecar_status", "status": "healthy" | "restarting"}`.

### Sidecar Launch

`bridge serve` starts both:
1. Go HTTP/WS server on `:7400` (scanner + web + spec broadcast)
2. Spawns Node sidecar as child process
3. Monitors sidecar health (ping/pong over unix socket, 5s interval)
4. Restarts sidecar on crash (exponential backoff)
5. Forwards SIGTERM/SIGINT to sidecar for clean shutdown

**Crash recovery**: When sidecar crashes, all pi child processes die with it. On restart, sidecar reads `~/.bridge/sessions/` manifest to discover sessions that were active. For each, it respawns `pi --mode rpc` and resumes. Browser receives `{"type": "sidecar_restarting", "sessions": [...]}` immediately, then `{"type": "session_recovered", "sessionId": "..."}` for each successfully resumed session, or `{"type": "session_lost", "sessionId": "..."}` for any that couldn't be recovered. UI shows a toast/banner during recovery.

### Pi Import: Vendored Types + Integration Tests

Vendor into `agent/vendor/pi/`:
- `rpc-types.ts` — command/response/event type definitions
- `jsonl.ts` — JSON lines parser
- `agent-events.ts` — AgentEvent type definitions (from pi-agent-core)

**Not vendored**: RpcClient class. We write our own thin process manager since we need different lifecycle semantics (multi-session, WS relay, crash recovery).

**Pi session persistence**: Let pi persist sessions normally (default behavior). This gives us free resume capability later. Configurable via `~/.bridge/config.json`:
- `sessionPersist: true` (default) — pi uses its default session directory
- `sessionPersist: false` — pass `--no-session` to pi
- `sessionDir: "/custom/path"` — pass `--session-dir` to pi

The sidecar also maintains a lightweight manifest at `~/.bridge/sessions/active.json` mapping session IDs → cwd/model/pi-session-id, used for crash recovery.

Integration test strategy:
- `agent/test/pi-compat.test.ts` — builds pi-mono from configurable path (default: `~/code/pi-mono`), spawns `pi --mode rpc`, validates our vendored types match actual protocol
- Env var `PI_MONO_PATH` overrides pi-mono location
- Runs as part of `bun test` but skipped if pi-mono not found (CI-friendly)

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
- `react-markdown` — agent response rendering
- `zustand` — state management

**agent/** (new package):
- Bun runtime
- `ws` or Bun built-in WS (for unix socket listener)
- Vendored pi types

## Implementation Phases

### Phase 1: React Shell + View System

**Goal**: Tab bar, view routing, existing treemap preserved.

1. Add React + react-dom to web/
2. Configure Vite for TSX + add WS proxy rule (`/ws` → `ws://localhost:7400/ws` in vite.config.ts)
3. `App.tsx` with tab bar (`1-4` keyboard shortcuts)
4. URL routing: `/` Complexity, `/workspace` Workspace, `/colony` Colony, `/sessions` Sessions
5. Canvas visibility toggled by view
6. Refactor main.ts into imperative canvas module:
   - Extract `initCanvas(el: HTMLCanvasElement): CanvasHandle`
   - `CanvasHandle` exposes: `destroy()`, `setVisible(bool)`, `updateSpec(spec)`
   - Render loop stays in vanilla TS, React calls init/destroy via `useEffect`
   - Zustand store holds spec + WS connection; canvas subscribes to store updates
   - Camera/hover/drag state stays internal to canvas module (not in zustand)
7. Placeholder content for Workspace/Sessions

**Migration note**: Current `main.ts` (~250 lines) is tightly coupled — state, event listeners, WS callbacks, canvas init all interleaved. The refactor extracts canvas lifecycle into `web/src/canvas/bridge.ts` as an imperative module. React doesn't own the render loop — it just mounts/unmounts the canvas.

**Ships**: Working tab navigation, treemap unchanged.

### Phase 2: Node Agent Sidecar

**Goal**: Node process managing pi sessions, connected to Go server.

1. Create `agent/` at repo root
2. Bun project with vendored pi types
3. Session manager: `Map<string, SessionHandle>`
4. Spawn `pi --mode rpc` per session, relay JSON lines
5. Unix socket listener at `~/.bridge/agent.sock`, JSON lines wire format
6. Handle: session_create, session_destroy, pi_command, sessions_list_request
7. Forward pi events back through Go → browser
8. **Go WS handler becomes bidirectional**: parse incoming JSON commands, route agent commands to sidecar (current wsReadPump is no-op — this is the migration)
9. Go generates session IDs (UUID) for session_create before forwarding to sidecar
10. Process crash handling: emit session_error with structured error code, cleanup map
11. Session manifest: write `~/.bridge/sessions/active.json` on session create/destroy
12. Drain/shutdown: wait for active sessions, SIGTERM children
13. Go server: spawn sidecar, connect to unix socket, proxy WS messages
14. Health check: ping/pong over unix socket, 5s interval, 3 misses = restart

**Ships**: Programmatic pi session creation/destruction from browser.

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
13. Sidecar status: toast/banner when sidecar is restarting, per-session recovery feedback

**Ships**: Functional agent chat from Bridge with full extension support.

### Phase 4: Workspace View

**Goal**: World state dashboard, branch-dashboard replacement.

1. Extend Go scanner: branch list, PR data per project
2. `WorkspaceView` React component:
   - Attention bar (items needing action)
   - Stats bar (projects, branches, PRs, active agents)
   - Project cards with branches, PRs, agent status
3. Search + filter pills (All, Has PRs, Active Agents, Stale)
4. Pi session status from sidecar (sessions_list query)
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
- [ ] `bridge serve` starts scanner + web + agent sidecar

After Phase 4:
- [ ] Workspace view shows branches, PRs, agent status
- [ ] Search and filter projects
- [ ] Attention bar surfaces items needing action

## Non-Goals (this milestone)

- Diff panel (future)
- Git operations from Bridge (future)
- Session history / resume UI (future — pi persists sessions to disk, recovery is automatic on sidecar crash)
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
| Sidecar launch | Go spawns Node child | Single `bridge serve` command, health monitoring |
| Go ↔ Node wire format | JSON lines over unix socket (`~/.bridge/agent.sock`) | Consistent with pi RPC, no port conflicts |
| Session ID ownership | Go server generates UUID | Central authority, avoids race conditions |
| Queue semantics | User chooses: steer (interrupt) vs follow_up (queue) | Both are valid intents — let user decide per-message |
| Max sessions | No limit | Single-user tool, trust the user |
| Extension UI | Relay to browser as modal dialogs | Proper support, extensions work correctly |
| Pi session persistence | Persist by default, configurable off | Free resume later, `~/.bridge/config.json` controls it |
| Sidecar crash recovery | Respawn + attempt session recovery from manifest | Maximize continuity, surface status to user |
| Home view / Colony as nav | 4 equal tabs, home configurable later | Colony nav hub is long-term, not MVP |
| Fractal zoom | Long-term vision, not MVP | Core to thesis but defer until nav/chat/workspace solid |
| Web framework | React via Vite | Panel views need component model, canvas stays vanilla |
| Pi API keys | Sidecar inherits env from `bridge serve` | Simplest, no separate auth config |
