# Bridge Focus Mode — Plan

> Transform Bridge from "see everything" firehose → focused workstation with opted-in projects.

## Problem

725 scanned projects in sidebar. Only ~23 active. Most are cloned-to-read/examples. The sidebar is unusable noise.

## Design Decisions

### Tab Structure
| Tab | Key | Path | What |
|-----|-----|------|------|
| **Sessions** | 1 | `/` | Sidebar + chat (daily driver) |
| **Workspace** | 2 | `/workspace` | Dashboard of opted-in projects |
| **Complexity** | 3 | `/complexity` | Per-project view, remembers last-viewed project. Stays as tab. |

**Colony: removed** from TABS and router. Canvas code stays (Complexity uses it).

> _Treemaps are likely not the long-term complexity viz — too coarse-grained for capturing complexity well. But keep Complexity tab functional for now._

### Opted-In Projects
- New concept: **"my projects"** — subset of scanned projects the user explicitly opts in to
- Stored in `~/.bridge/config.json` as `focusedProjects: string[]` (array of spec project IDs, e.g. `"project:code/bridge"`)
- Sidebar only shows opted-in projects
- Workspace only shows opted-in projects
- Cmd+K search searches ALL scanned projects (for adding new ones)
- **Auto-opt-in on first run**: projects with uncommitted changes or activity in last 14 days are auto-added (no onboarding overlay)

### Sidebar Sort Order
1. **Pinned** projects (manual, sticky at top)
2. **By session recency** — most recently used session floats up
3. Projects with no sessions at bottom, alphabetical

### Pinning
- Stored in `~/.bridge/config.json` as `pinnedProjects: string[]`
- Pin/unpin via hover star icon + right-click context menu

### Project Management UX
- **Hover buttons**: pin/star icon on hover (quick actions)
- **Right-click context menu**: Pin/Unpin, Remove project, View complexity (full actions)
- Both available on sidebar project entries

## Implementation Steps

### Step 1: Config model for opted-in + pinned projects
- Extend `~/.bridge/config.json` schema: add `focusedProjects: string[]` and `pinnedProjects: string[]`
- Go: read/write these fields in config loader
- WS: new command types `project_opt_in`, `project_opt_out`, `project_pin`, `project_unpin`
- Go server handles these by updating config.json atomically
- **Files**: `scan/internal/config/config.go`, `scan/internal/server/ws.go`

### Step 2: Auto-opt-in active projects on first run
- After scan completes, if `focusedProjects` is empty in config:
  - Find projects with uncommitted changes OR last commit within 14 days
  - Exclude monorepo children (parent already represents)
  - Write these IDs to `focusedProjects` in config
- This seeds a useful starting set without any onboarding UI
- **Files**: `scan/internal/config/config.go`, `scan/cmd/bridge/` or `scan/internal/server/`

### Step 3: Expose opted-in projects to web
- New WS event `config_update` that pushes config changes to browser
- Store gets `focusedProjectIds: Set<string>` and `pinnedProjectIds: Set<string>`
- Derive `myProjects` from `spec.projects.filter(p => focusedIds.has(p.id))`
- **Files**: `web/src/store.ts`, `web/src/main.tsx`, `web/src/agent/ws-types.ts`

### Step 4: Filter sidebar to opted-in projects only
- SessionSidebar: filter projects to `myProjects` instead of all
- Sort: pinned first, then by most-recent-session timestamp, then alphabetical
- Track `lastSessionAt` per project in store (updated when session created/events received)
- **Files**: `web/src/views/sessions/SessionSidebar.tsx`, `web/src/store.ts`

### Step 5: Cmd+K project search
- Overlay triggered by Cmd+K (or click "Add project" in sidebar)
- Searches ALL scanned projects by name
- Selecting a non-opted-in project → opts it in + creates session
- Selecting an opted-in project → creates session (or focuses existing)
- **Files**: new `web/src/views/sessions/ProjectSearch.tsx`, update `web/src/App.tsx`

### Step 6: Remove Colony tab
- Remove Colony from TABS array and router
- Keep Complexity tab — shows last-viewed project (eventually gets a project picker)
- Canvas code stays, scoped to single-project view
- **Files**: `web/src/App.tsx`, `web/src/router.ts`

### Step 7: Filter Workspace to opted-in projects
- WorkspaceView uses `myProjects` instead of all projects
- Attention bar only computes for opted-in projects
- "Add project" button in Workspace links to Cmd+K search
- **Files**: `web/src/views/WorkspaceView.tsx`

### Step 8: Sidebar project management
- Hover-reveal star/pin icon on project rows
- Right-click custom context menu: Pin/Unpin, Remove project, View complexity
- "Add project" button at bottom of sidebar (opens Cmd+K)
- **Files**: `web/src/views/sessions/SessionSidebar.tsx`, new `web/src/ui/ContextMenu.tsx`

## Data Model

### ~/.bridge/config.json additions
```json
{
  "scanRoots": ["~/code", "~/work"],
  "focusedProjects": ["project:code/bridge", "project:work/twig", "project:work/ergo"],
  "pinnedProjects": ["project:code/bridge"]
}
```

### Store additions
```typescript
focusedProjectIds: Set<string>;
pinnedProjectIds: Set<string>;
lastSessionAt: Map<string, number>;  // projectId → timestamp
addFocusedProject: (id: string) => void;
removeFocusedProject: (id: string) => void;
togglePinProject: (id: string) => void;
```

### WS protocol additions
```jsonc
// Browser → Server
{"type": "project_opt_in", "projectId": "project:code/bridge"}
{"type": "project_opt_out", "projectId": "project:code/bridge"}
{"type": "project_pin", "projectId": "project:code/bridge"}
{"type": "project_unpin", "projectId": "project:code/bridge"}

// Server → Browser  
{"type": "config_update", "focusedProjects": [...], "pinnedProjects": [...]}
```

## What We're NOT Doing (yet)
- Onboarding overlay (auto-opt-in handles first run; Cmd+K for manual adds)
- Session resume from pi's persisted sessions (needs pi RPC `list_sessions`)
- Session search within projects
- Complexity project picker (Complexity tab just shows last-viewed project)
- Better complexity visualization (treemaps are placeholder)
- Sound effects
- Fractal zoom

## Consensus Notes
- **grug-architect**: Keep config in ~/.bridge/config.json, not localStorage — survives browser clears, single source of truth
- **product-owner**: Auto-opt-in active repos on first run removes need for onboarding overlay. Cmd+K is the universal add mechanism.
- **code-critic**: Canvas code stays for Complexity. Safest to remove Colony tab first (low risk), then add opt-in model (medium risk), then Cmd+K (new code, no risk to existing)
- **All agree**: Don't touch Go scanner — it still scans everything. Filtering is purely a web UI concern. Config stores which projects to show.
