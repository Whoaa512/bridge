# Bridge Battle Station — Plan

> Evolve Bridge from read-only project viewer → main dev battle station for coordinating agents and managing complexity at scale.

## Vision

You sit down. Open Bridge. See every project, every active agent, every branch. Start a pi session against any project. Watch complexity grow in real time as agents work. Triage what needs attention. This is where you do work.

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
  state: "idle" | "streaming" | "compacting";
  abort: () => void;
  queueMessage: (text: string) => void;
};

const sessions = new Map<string, SessionHandle>();
```

Features:
- Queue messages while streaming (steer/follow_up)
- Abort running sessions
- Track streaming/idle/compacting state per session
- Clean up on process crash
- Waiters for drain on sidecar shutdown

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
{"type": "session_create", "id": "req_1", "cwd": "/path", "model": "sonnet"}
{"type": "session_destroy", "id": "req_2", "sessionId": "abc123"}
{"type": "pi_command", "sessionId": "abc123", "command": {"type": "prompt", "message": "..."}}

// Agent events (sidecar → server → browser)
{"type": "session_created", "id": "req_1", "sessionId": "abc123"}
{"type": "session_destroyed", "id": "req_2"}
{"type": "session_error", "sessionId": "abc123", "error": "pi process crashed"}
{"type": "pi_event", "sessionId": "abc123", "event": {/* AgentEvent */}}
{"type": "pi_response", "sessionId": "abc123", "response": {/* RpcResponse */}}
{"type": "sessions_list", "sessions": [{...}]}
```

### Go ↔ Node Sidecar Communication

Go spawns Node sidecar as child process, monitors health, restarts on crash.

Internal protocol options (pick one during implementation):
1. **Unix socket** — sidecar listens on `~/.bridge/agent.sock`, Go connects as client
2. **HTTP** — sidecar on localhost with random port, Go reverse-proxies agent WS messages
3. **stdio** — Go talks to sidecar via stdin/stdout (same pattern as pi RPC)

Recommendation: **Unix socket**. No port conflicts, fast, Go's `net.Dial("unix", ...)` is trivial.

### Sidecar Launch

`bridge serve` starts both:
1. Go HTTP/WS server on `:7400` (scanner + web + spec broadcast)
2. Spawns Node sidecar as child process
3. Monitors sidecar health (ping/pong or process exit)
4. Restarts sidecar on crash (exponential backoff)
5. Forwards SIGTERM/SIGINT to sidecar for clean shutdown

### Pi Import: Vendored Types + Integration Tests

Vendor into `agent/vendor/pi/`:
- `rpc-types.ts` — command/response/event type definitions
- `jsonl.ts` — JSON lines parser
- `agent-events.ts` — AgentEvent type definitions (from pi-agent-core)

**Not vendored**: RpcClient class. We write our own thin process manager since we need different lifecycle semantics (multi-session, WS relay, crash recovery).

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
2. Configure Vite for TSX
3. `App.tsx` with tab bar (`1-4` keyboard shortcuts)
4. URL routing: `/` Complexity, `/workspace` Workspace, `/colony` Colony, `/sessions` Sessions
5. Canvas visibility toggled by view
6. Move canvas init into imperative bridge called from React
7. Placeholder content for Workspace/Sessions

**Ships**: Working tab navigation, treemap unchanged.

### Phase 2: Node Agent Sidecar

**Goal**: Node process managing pi sessions, connected to Go server.

1. Create `agent/` at repo root
2. Bun project with vendored pi types
3. Session manager: `Map<string, SessionHandle>`
4. Spawn `pi --mode rpc` per session, relay JSON lines
5. Unix socket listener for Go communication
6. Handle: session_create, session_destroy, pi_command
7. Forward pi events back through Go → browser
8. Process crash handling: emit session_error, cleanup map
9. Drain/shutdown: wait for active sessions, SIGTERM children
10. Go server: spawn sidecar, connect to unix socket, proxy WS messages
11. Health check: periodic ping, restart on failure

**Ships**: Programmatic pi session creation/destruction from browser.

### Phase 3: Sessions View + Chat

**Goal**: Send prompts, see streamed responses, abort.

1. `SessionsView` React component: session sidebar + chat area
2. Session list: active sessions with cwd, model, state badge
3. "New Session" button: pick project from spec, create session
4. Chat area: scrollable messages (user + agent)
5. Composer: text input, Enter to send, Esc to abort
6. Markdown rendering for responses
7. Tool call display: collapsible name + args (read, bash, edit, write)
8. Streaming: `text_delta` events append in real time
9. State indicator: model name, thinking level, idle/streaming
10. Multiple sessions: switch between active sessions in sidebar

**Ships**: Functional agent chat from Bridge.

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
- Session history / resume (future — pi persists sessions already)
- Sound effects (M4b per original plan)
- Embedded pi SDK (RPC is sufficient for now)
- Custom tool injection (pi's default tools are fine)

## Resolved Decisions

| Question | Decision | Rationale |
|---|---|---|
| Pi integration | RPC subprocess | Simpler, isolated, no dependency coupling |
| Session tracking | Active run map with handles | Need queue/abort/state per session (OpenClaw pattern) |
| WebSocket | Single multiplexed | Simpler for browser, Go proxies internally |
| Pi import | Vendor types + integration tests | Decoupled, testable against fresh pi builds |
| Sidecar launch | Go spawns Node child | Single `bridge serve` command, health monitoring |
| Go ↔ Node | Unix socket (recommended) | No port conflicts, fast, clean |
| Web framework | React via Vite | Panel views need component model, canvas stays vanilla |
