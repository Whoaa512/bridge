# Bridge Focus Mode — Plan

> Transform Bridge from "see everything" firehose → focused workstation with opted-in projects.

## Problem

725 scanned projects in sidebar. Only ~23 active. Most are cloned-to-read/examples. The sidebar is unusable noise.

## Design Decisions

### Tab Structure: 3 tabs → 2 primary + 1 utility
| Tab | Key | Path | What |
|-----|-----|------|------|
| **Sessions** | 1 | `/` | Sidebar + chat (daily driver) |
| **Workspace** | 2 | `/workspace` | Dashboard of opted-in projects |
| **Complexity** | — | `/complexity/:projectId` | Per-project treemap (linked from Workspace/Sessions, not a tab) |

**Colony: removed.** Canvas code stays (Complexity still uses it), but Colony tab and "all projects" filter mode are deleted.

### Opted-In Projects
- New concept: **"my projects"** — subset of scanned projects the user explicitly opts in to
- Stored in `~/.bridge/config.json` as `projects: string[]` (array of project IDs)
- Sidebar only shows opted-in projects
- Workspace only shows opted-in projects
- Cmd+K search searches ALL scanned projects (for adding new ones)

### Sidebar Sort Order
1. **Pinned** projects (manual, sticky at top)
2. **By session recency** — most recently used session floats up
3. Projects with no sessions at bottom

### Pinning
- Stored in `~/.bridge/config.json` as `pinnedProjects: string[]`
- Pin/unpin via right-click context menu or star icon in sidebar

## Implementation Steps

### Step 1: Config model for opted-in + pinned projects
- Extend `~/.bridge/config.json` schema: add `projects: string[]` and `pinnedProjects: string[]`
- Go: read/write these fields in config loader
- WS: new command types `project_opt_in`, `project_opt_out`, `project_pin`, `project_unpin`
- Go server handles these by updating config.json atomically
- **Files**: `scan/internal/config/config.go`, `scan/internal/server/ws.go`

### Step 2: Expose opted-in projects to web
- New WS event `config_update` that pushes config changes to browser
- Store gets `optedInProjectIds: Set<string>` and `pinnedProjectIds: Set<string>`
- Derive `myProjects` from `spec.projects.filter(p => optedInIds.has(p.id))`
- **Files**: `web/src/store.ts`, `web/src/main.tsx`, `web/src/agent/ws-types.ts`

### Step 3: Onboarding flow
- On first load, if `optedInProjectIds` is empty → show onboarding overlay
- Onboarding: searchable list of all scanned repos (not monorepo children), checkboxes to opt in
- "Get started" button saves selections via WS commands
- Show project count + hints ("these are repos you've committed to recently")
- Pre-check projects with recent activity (uncommitted changes, last 14 days)
- **Files**: new `web/src/views/Onboarding.tsx`, update `web/src/App.tsx`

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

### Step 6: Remove Colony tab, demote Complexity
- Remove Colony from TABS array and router
- Complexity becomes a route `/complexity/:projectId` (not a tab)
- Add "View complexity" link in Workspace project cards and session headers
- Canvas code stays, just scoped to single-project view
- **Files**: `web/src/App.tsx`, `web/src/router.ts`, `web/src/main.tsx`, canvas filter logic

### Step 7: Filter Workspace to opted-in projects
- WorkspaceView uses `myProjects` instead of all projects
- Attention bar only computes for opted-in projects
- "Add project" button in Workspace links to Cmd+K search
- **Files**: `web/src/views/WorkspaceView.tsx`

### Step 8: Sidebar project management
- Right-click context menu: Pin/Unpin, Remove project, View complexity
- Star/pin icon visible on hover
- "Add project" button at bottom of sidebar (opens Cmd+K)
- **Files**: `web/src/views/sessions/SessionSidebar.tsx`

## Data Model

### ~/.bridge/config.json additions
```json
{
  "scanRoots": ["~/code", "~/work"],
  "projects": ["bridge", "twig", "ergo"],
  "pinnedProjects": ["bridge"]
}
```

### Store additions
```typescript
optedInProjectIds: Set<string>;
pinnedProjectIds: Set<string>;
lastSessionAt: Map<string, number>;  // projectId → timestamp
addOptedInProject: (id: string) => void;
removeOptedInProject: (id: string) => void;
togglePinProject: (id: string) => void;
```

### WS protocol additions
```jsonc
// Browser → Server
{"type": "project_opt_in", "projectId": "..."}
{"type": "project_opt_out", "projectId": "..."}
{"type": "project_pin", "projectId": "..."}
{"type": "project_unpin", "projectId": "..."}

// Server → Browser  
{"type": "config_update", "projects": [...], "pinnedProjects": [...]}
```

## What We're NOT Doing (yet)
- Session resume from pi's persisted sessions (needs pi RPC `list_sessions` — defer)
- Session search within projects
- Complexity per-project drill-down (keep tab for now, just remove Colony)
- Sound effects
- Fractal zoom

## Consensus Notes
- **grug-architect**: Keep config in ~/.bridge/config.json, not localStorage — survives browser clears, single source of truth
- **product-owner**: Onboarding is critical for first-run experience, but keep it dead simple — just a searchable checklist
- **code-critic**: Canvas code stays for Complexity, just remove Colony filter mode. Safest to remove Colony tab first (low risk), then add opt-in model (medium risk), then onboarding (new code, no risk to existing)
- **All agree**: Don't touch Go scanner — it still scans everything. Filtering is purely a web UI concern. Config stores which projects to show.
