# Bridge Focus Mode — Plan

> Only scan what you explicitly add. Everything else doesn't exist.

## Problem (v2)

v1 auto-seeded 58 projects from "activity in 14 days" heuristic — still too many. Fundamental issue: scanning 725 repos then filtering is backwards. Scanner should only scan what you care about.

## Model Flip

**Old**: Scan everything → filter in UI
**New**: Only scan `focusedProjects` from config → clean by default

- `~/.bridge/config.json` `focusedProjects` is the source of truth for what gets scanned
- Scanner walks only those paths (no more `scanRoots` → `discover.Walk()` → 725 repos)
- ⌘K adds projects by path (from filesystem or known git repos)
- Session history hydrated from `~/.pi/agent/sessions/` per-project

## Implementation

### Step 1: Nuke auto-seed, clear focusedProjects
- Remove `SeedFocusedProjects()` from config and main.go
- Set `focusedProjects: []` in existing config (one-time reset)
- Scanner only scans projects in `focusedProjects` list

### Step 2: Scanner only scans focused projects
- `focusedProjects` stores absolute paths (not IDs)
- New `discover.BuildSpecForPaths(paths []string)` — skips Walk, directly processes each path
- Falls back to full scan if focusedProjects is empty? Or just returns empty spec? (empty is correct)
- Keep `scanRoots` in config for ⌘K project discovery (searching for repos to add)

### Step 3: ⌘K searches filesystem for git repos
- ⌘K overlay changes: instead of searching spec.projects (which is now tiny), search for git repos under scanRoots
- Go server: new WS command `project_search` → walks scanRoots, returns matching repos
- Or: pre-build a lightweight index of known repos (just paths + names) on startup, serve via WS

### Step 4: Session history hydration from ~/.pi/agent/sessions
- Go server reads `~/.pi/agent/sessions/` directory structure
- Dir name format: `--Users-cj_winslow-code-bridge--` → path `/Users/cj_winslow/code/bridge`
- JSONL files: first line has `{"type":"session","id":"...","timestamp":"...","cwd":"..."}`
- For each focused project, find matching session dir, list sessions
- Send historical sessions to web (distinct from active pi sessions)
- Web shows them in sidebar under each project

## Data Model

### ~/.bridge/config.json
```json
{
  "scanRoots": ["~/code", "~/work"],
  "focusedProjects": ["/Users/cj_winslow/code/bridge", "/Users/cj_winslow/work/twig"],
  "pinnedProjects": ["/Users/cj_winslow/code/bridge"]
}
```

Note: focusedProjects now stores absolute paths, not project IDs. Simpler, no indirection.

### Session history
```
~/.pi/agent/sessions/
  --Users-cj_winslow-code-bridge--/
    2026-03-19T00-03-49-756Z_dc36b8b7.jsonl   ← each file = 1 session
    2026-03-20T15-30-00-000Z_abc12345.jsonl
```

Each JSONL first line:
```json
{"type":"session","version":3,"id":"dc36b8b7-...","timestamp":"2026-03-19T00:03:49.756Z","cwd":"/Users/cj_winslow/code/bridge"}
```
