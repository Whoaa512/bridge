# Bridge — Design Document

> A video-game-inspired command center for your entire dev environment. Scan your machine, see every project, service, and resource as an interactive colony map. ONI meets `htop` meets a starship bridge.

## Vision

You sit down at your machine. You open Bridge. You see *everything* — every project, every running service, every stale branch, every failing build — rendered as a living colony map. Projects pulse with activity. Alerts pop when CI fails. The cycle report tells you what changed overnight. It's your dev environment as a game you're winning.

Bridge takes design language from **Oxygen Not Included** and resource management games:
- Colony overview → your machine's project landscape
- Vitals panel → per-project health metrics
- Alerts overlay → red/yellow/green warnings (stale PRs, failing CI, uncommitted work)
- Priority system → what to work on next
- End-of-cycle report → daily/weekly summary of changes
- **Delight** — sounds, animations, feedback loops that make it fun to use. Built for flow state.

## Primary Jobs-to-Be-Done

1. **Orient** — "What's the state of all my work right now?"
2. **Triage** — "What needs attention? What's on fire?"
3. **Navigate** — "Open that project, that PR, that running service"
4. **Track** — "How did my work change this week? What's stale?"

## What Gets Tracked

### Projects (the core unit)
- Git repos (primary signal)
- Notable non-git directories (e.g. `~/work/cj/notes`)
- Monorepo sub-projects (detected via `_infra/project.yml`, `package.json` workspaces, Go modules)
- Manually tagged/registered directories
- User overlay configs that augment (never replace) auto-detection

### Per-Project Metrics
- **Activity**: last commit, last file touch, staleness score
- **Git**: branches, uncommitted changes, ahead/behind, stash count
- **CI/Build**: Buildkite/GitHub Actions status (green/red/pending)
- **PRs**: open count, review state, merge conflicts
- **Tasks**: linked Asana tasks, completion state
- **Size**: LOC, languages, dependency count

### Classification
- **Public** — remote on github.com
- **Internal** — remote on git.musta.ch, OR has `_infra/project.yml` in root
- **Personal** — no remote, or in `~/work/cj/`
- **Manual override** — user can reclassify anything via overlay config

### Local Infrastructure
- **Ports**: what's listening, PID, process name, mapped back to projects (multi-strategy: CWD → process tree walk → config → null)
- **Docker**: running containers, their ports, health status, image info (limited to current Docker context)
- **Process tree**: CPU/mem per project working directory
- **Services**: dev servers, databases, watchers — linked to their parent project

### External API Rate Limits

Polling Buildkite + GHE + GitHub for 50+ projects will hit rate limits. Strategy:
- **Batch requests** — group PRs/builds per org, not per repo
- **TTL cache** — CI/PR data cached for 5min, Asana for 10min
- **Exponential backoff** — on rate limit response (429), back off 2x up to 30min
- **Stale-data indicators** — spec includes `updatedAt` per section so consumers know data freshness
- **Priority-aware polling** — high-priority projects polled more frequently than low-priority

## Credentials & Auth

Scanner reuses existing CLI auth tokens — no dedicated credential store.

| Service | Auth Source | Fallback |
|---|---|---|
| GitHub.com | `gh auth token` | - |
| GHE (git.musta.ch) | `GH_HOST=git.musta.ch gh auth token` | - |
| Buildkite | `bk` CLI config (`~/.buildkite/config.json`) | - |
| Asana | `asana` CLI config | - |

If a CLI tool isn't authenticated, that data source returns null with an entry in the project's `errors` array. Scanner never fails because an external service is unavailable.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Bridge Web UI                      │
│         (Canvas2D colony map + HTML overlays)         │
│         localhost:7400                                 │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/WebSocket
┌──────────────────────┴──────────────────────────────┐
│                  Bridge Scanner (Go)                  │
│  - Project discovery & classification                 │
│  - Git status collection                              │
│  - Port/process/Docker scanning                       │
│  - CI/PR/Asana polling                                │
│  - fsnotify watcher for incremental updates           │
│  - Emits bridge-spec.json + live WebSocket updates    │
└──────────────────────────────────────────────────────┘
```

### Component Breakdown

```
bridge/
├── scan/              # Go scanner daemon
│   ├── cmd/           # CLI entry point: `bridge scan`, `bridge serve`, `bridge status`, `bridge rpc`
│   └── internal/
│       ├── discover/  # Project discovery (walk dirs, detect git, classify)
│       ├── git/       # Git status per repo (branches, uncommitted, ahead/behind)
│       ├── infra/     # Port scan, Docker, process tree
│       ├── ci/        # Buildkite + GitHub Actions polling
│       ├── tasks/     # Asana integration
│       ├── watch/     # fsnotify watcher + TTL cache for incremental scanning
│       └── spec/      # Bridge spec types + JSON emission
├── web/               # Web dashboard (TypeScript + Canvas2D)
│   └── src/
│       ├── core/      # Spec loader, state, WebSocket client
│       ├── canvas/    # Colony map renderer (treemap tiles, animations, effects)
│       ├── layout/    # Treemap + clustering algorithms
│       ├── overlays/  # Alerts, vitals, priority, infra map (see OVERLAYS.md)
│       ├── audio/     # Sound effects (alert chimes, activity sounds)
│       └── ui/        # HTML panels (drawer, cycle report, search)
├── fractal/           # Codebase visualizer (moved from ~/code/fractal at M5)
│   ├── parse/         # Go parser (unchanged)
│   └── view/          # TS viewer (will share render lib with web/)
├── packages/
│   └── render/        # Shared Canvas2D rendering primitives (created at M5, not before)
│       ├── treemap.ts # Squarified treemap layout
│       ├── camera.ts  # Pan/zoom/focus
│       ├── hit.ts     # Hit testing
│       └── effects.ts # Glow, pulse, particle effects
├── spec/              # JSON schemas (bridge-spec + fractal-spec)
└── docs/              # This doc + OVERLAYS.md + plans
```

### Why This Structure (Agent-Native)

- **Flat tool directories** — each tool (`scan/`, `web/`, `fractal/`) has its own build/test/lint. Agents can work in isolation.
- **Shallow nesting** — agents don't need to navigate deep hierarchies
- **Shared packages deferred** — `packages/render/` created only at M5 when fractal moves in and shared rendering is proven needed
- **Independent deployment** — scanner is a Go binary, web is a static site + dev server, fractal remains standalone until M5

### Incremental Scanning

Full directory walks are expensive. The scanner uses a two-layer caching strategy from M0:

1. **fsnotify watcher** — watches discovered project dirs for `.git/` changes (commits, branch switches, stash). Triggers per-project rescan only.
2. **TTL cache** — each data source has its own TTL:
   - Git status: 10s (cheap, local)
   - Port/process scan: 30s (lsof is fast)
   - Docker: 60s
   - CI/PR polling: 5min (external API, rate-limited)
   - Asana tasks: 10min
   - Full directory walk (discovery): 1hr or on-demand
3. **Dirty flags** — fsnotify events mark individual projects dirty. Next scan cycle only refreshes dirty projects + expired TTLs.

On first run, a full scan executes. Subsequent scans are incremental.

### Graceful Degradation

Scanner is best-effort per-project, per-section. It never fails because one project is broken or one API is down.

Each project in the spec carries an `errors` array:

```jsonc
"errors": [
  {
    "source": "ci",          // which subsystem failed
    "message": "Buildkite API timeout",
    "at": "2026-03-18T17:00:00Z"
  }
]
```

Rules:
- A broken `.git` → git fields are null, error logged, project still appears
- API timeout → cached stale data used if available, error logged
- Unauthed CLI tool → that section returns null with error, everything else proceeds
- Symlinks → resolved to canonical paths during walk, deduped by real path
- Git race conditions (reading while user commits) → retry once, then use last-known-good
- Config validation errors → logged to stderr, invalid entries skipped, valid config still applied

### Security

- `~/.bridge/spec.json` written with mode `0600` (contains paths, URLs, port info)
- `~/.bridge/config.json` written with mode `0600`
- No credentials stored in bridge config — auth delegated to existing CLI tools

## The Bridge Spec

The contract between scanner and web UI. Analogous to fractal's `.fractal/` spec.

```
~/.bridge/
├── spec.json          # Full scan result
├── config.json        # User overrides (classifications, priorities, custom groups)
└── cache/             # Cached CI/PR/Asana data
```

### Spec Schema (draft)

**Versioning**: spec uses semver. Major bumps = breaking schema changes. Minor bumps = additive fields. Scanner writes `version` field; consumers should check major version and warn on mismatch.

```jsonc
{
  "version": "0.1.0",
  "scannedAt": "2026-03-18T17:00:00Z",
  "machine": {
    "hostname": "cj-mbp",
    "os": "darwin",
    "uptime": 432000
  },
  "projects": [
    {
      "id": "project:code/fractal",       // relative to scanRoot, always uses this form
      "path": "/Users/cj_winslow/code/fractal",
      "name": "fractal",
      "kind": "git_repo",
      "classification": "public",
      "classificationSource": "remote",  // "remote" | "infra" | "manual"
      "languages": ["go", "typescript"],
      "git": {
        "branch": "main",
        "uncommitted": 2,
        "ahead": 0,
        "behind": 3,
        "stashCount": 1,
        "lastCommit": "2026-03-17T12:52:00Z",
        "remoteUrl": "git@github.com:cjwinslow/fractal.git"
      },
      "ci": {
        "status": "passed",        // "passed" | "failed" | "running" | "pending" | null
        "url": "https://...",
        "updatedAt": "2026-03-17T13:00:00Z"
      },
      "prs": [
        {
          "number": 42,
          "title": "Add enrichment caching",
          "state": "open",
          "reviewStatus": "approved",
          "url": "https://..."
        }
      ],
      "tasks": [
        {
          "gid": "1234567890",
          "name": "Ship fractal v2",
          "completed": false,
          "url": "https://..."
        }
      ],
      "size": {
        "loc": 4200,
        "files": 38,
        "deps": 12
      },
      "activity": {
        "lastTouch": "2026-03-17T12:52:00Z",
        "commitsThisWeek": 14,
        "staleDays": 0
      },
      "subprojects": [],           // For monorepos — IDs use full relative path: "project:code/mono/packages/foo"
      "priority": 5,               // 1-9 ONI-style, user-set
      "flags": ["has_ci", "has_prs", "monorepo"],
      "errors": []                 // Per-project scan errors (see Graceful Degradation)
    }
  ],
  "infrastructure": {
    "ports": [
      {
        "port": 3000,
        "pid": 12345,
        "process": "bun",
        "cwd": "/Users/cj_winslow/code/fractal/view",
        "projectId": "project:code/fractal",  // null if unmatched
        "url": "http://localhost:3000"
      }
    ],
    "docker": [
      {
        "containerId": "abc123",
        "image": "postgres:16",
        "name": "dev-postgres",
        "status": "running",
        "ports": [{"host": 5432, "container": 5432}],
        "projectId": null
      }
    ],
    "resources": {
      "cpuByProject": {"project:code/fractal": 2.3},
      "memByProject": {"project:code/fractal": 128000000}
    }
  },
  "alerts": [
    {
      "severity": "warning",       // "critical" | "warning" | "info"
      "projectId": "project:code/fractal",
      "type": "stale_pr",
      "message": "PR #42 open for 7 days",
      "url": "https://..."
    }
  ],
  "cycle": {
    "period": "daily",
    "start": "2026-03-17T00:00:00Z",
    "end": "2026-03-18T00:00:00Z",
    "summary": {
      "commitsTotal": 23,
      "projectsActive": 4,
      "prsOpened": 2,
      "prsMerged": 1,
      "alertsNew": 3,
      "alertsResolved": 1
    }
  }
}
```

### User Config (overlay)

On first run, `bridge scan` triggers an **onboarding flow** — interactive prompt walks user through:
1. Confirm scan root (default: `~/`)
2. Review and customize ignore list
3. Set initial project priorities (optional)

This generates `~/.bridge/config.json`. Subsequent runs use it.

```jsonc
// ~/.bridge/config.json
{
  "scanRoots": ["~/"],
  "ignore": [
    "node_modules", ".git", "vendor", "bazel-*",
    "Library", "Applications", ".Trash",
    "Dropbox", "Google Drive", "Downloads",
    "Desktop", "Movies", "Music", "Pictures"
  ],
  "maxDepth": 3,
  "classifications": {
    "project:code/fractal": "personal",    // override auto-detected
    "project:work/twig": "internal"
  },
  "priorities": {
    "project:code/bridge": 9,
    "project:code/fractal": 7
  },
  "groups": {
    "Airbnb": ["project:work/twig*", "project:work/ergo*"],
    "Personal Tools": ["project:code/bridge", "project:code/fractal"],
    "Side Projects": ["project:code/chairs"]
  },
  "services": {
    "knownPorts": {
      "7432": "branch-dashboard",
      "3000": "fractal-view"
    }
  }
}
```

## Discovery Algorithm

```
1. Walk scanRoots (default: ~/)
2. Skip ignored dirs (node_modules, .git, vendor, Library, etc.)
3. Resolve symlinks to canonical paths; dedup by real path (never scan a repo twice)
4. For each directory:
   a. Has .git? → git project
   b. Has _infra/project.yml? → internal airbnb project (may be monorepo child)
   c. Has package.json with workspaces? → monorepo, recurse children
   d. Has go.work or go.mod with replace directives? → multi-module Go project
   e. On manual include list? → custom project
   f. Otherwise → skip (not a project)
5. Don't recurse INTO git repos (except for monorepo sub-project detection)
6. Classify each project (remote URL → public/internal, _infra → internal, config override)
7. Collect git stats, match running ports, check CI/PRs
```

### Project ID Convention

IDs use the form `project:<relative-path-from-scan-root>`.

- Simple repo: `project:code/fractal`
- Monorepo child: `project:code/mono/packages/foo` (full relative path, no special encoding)
- Projects discovered from multiple scan roots: first match wins

This keeps IDs greppable, agent-friendly, and predictable from the filesystem path alone.

### Port → Project Mapping

Multi-strategy resolution (first match wins):
1. **CWD match** — lsof PID → `/proc/<pid>/cwd` → match to project path
2. **Parent process walk** — walk up the process tree checking CWDs (catches subprocesses)
3. **Config fallback** — `config.json` `services.knownPorts` for static mappings
4. **Null** — unmatched ports still appear in infra section with `projectId: null`

Docker containers have no host CWD — mapping relies entirely on config + image/name heuristics.

## Game Design Language

### ONI Mechanics → Bridge Equivalents

| ONI Concept | Bridge Equivalent |
|---|---|
| Colony overview | Machine-wide project map (treemap tiles) |
| Duplicant | You (the developer). One duplicant, many errands. |
| Errands / tasks | PRs to review, branches to merge, tasks to complete |
| Priority 1-9 | Project priority (user-set, affects tile size/position) |
| Stress level | Project staleness score (stale branches, old PRs, failing CI) |
| Oxygen/food alerts | Critical alerts (CI failing, merge conflicts, PRs aging out) |
| Cycle report | Daily summary card — what happened across all projects |
| Pipe overlay | Resource flow view — git activity flow between repos over time |
| Power overlay | Infrastructure view — ports, services, Docker, resource usage |
| Research queue | Tech debt / learning backlog (manual tagging) |
| Vitals screen | Per-project detail panel with all metrics |

### Visual Language

- **Tiles**: each project is a tile in a treemap. Size = LOC or priority. Color = classification.
- **Pulse**: active projects glow/pulse based on recent commit frequency
- **Alert badges**: red/yellow/green dots on tiles, like ONI's status icons
- **Temperature**: staleness visualized as "temperature" — cold blue (stale) to warm orange (active)
- **Overlays**: toggle between views (like ONI's overlay system):
  - Default: colony map with health indicators
  - Git overlay: branches, uncommitted changes, ahead/behind
  - CI overlay: build status across all projects
  - Infra overlay: running services, ports, Docker
  - Priority overlay: 1-9 heat map

### Sound Design (committed at M4b, or not at all)

Half-implemented audio is worse than none. At M4b, either ship the full sound pack or drop it.

- Ambient hum that changes with system load
- Soft chime on build pass
- Warning tone on build fail
- Click/select sounds on interaction
- Achievement sound on PR merge
- Volume/toggle in settings

### Animations

- Smooth tile transitions on data refresh
- Pulse effect on active projects
- Particle burst on achievements (PR merged, all tests green)
- Alert badges slide in/out
- Zoom transitions between overview and detail views

## Integration Points

### Branch Dashboard (existing tool to absorb)

`~/work/cj/tools/branch-dashboard` already tracks:
- iTerm tabs, branches, PRs across twig/ergo repos
- Asana task links
- Tab tags
- Pi session topics

Bridge absorbs this: the branch dashboard's data collection becomes part of the scanner, its workspace view becomes a panel in Bridge's web UI.

### Fractal (codebase visualizer)

Drill-down from a project tile → opens fractal view of that project's internal structure. Shared rendering primitives in `packages/render/`.

### Pi (coding agent)

Bridge can read pi session topics from `~/.pi/agent/session-topics.json` and show active agent sessions per project.

## CLI Interface

Every command supports `--json` for structured output. Agents should always use `--json`.

```bash
bridge                  # Open web dashboard (launches browser + scanner if needed)
bridge scan             # Run one-shot scan, emit spec.json
bridge serve            # Start scanner daemon + web server
bridge status           # Quick terminal summary (top alerts, active projects)
bridge status <project> # Detail for one project
bridge config           # Open config in $EDITOR
bridge priority <project> <1-9>  # Set project priority (writes to config.json)
bridge ack <alert-id>   # Acknowledge an alert (writes to config.json)
bridge alerts           # List current alerts
bridge query <filter>   # Filter projects (e.g. `bridge query ci.status=failed`)

# RPC subcommand — structured programmatic access for agents/scripts
bridge rpc scan                    # Trigger scan, return spec as JSON
bridge rpc projects                # List all projects
bridge rpc project <id>            # Get single project
bridge rpc alerts                  # List alerts
bridge rpc infra                   # Infrastructure snapshot
bridge rpc set-priority <id> <n>   # Set priority
bridge rpc ack-alert <alert-id>    # Acknowledge alert
```

`bridge rpc` always outputs JSON, never human-formatted text. Designed for piping and agent consumption.

## MVP Milestones

Testing is inline — each milestone includes its own test expectations.

### M0: Scanner Foundation
- [ ] Go project scaffold in `scan/`
- [ ] Directory walker with ignore rules + symlink dedup
- [ ] Git repo detection + basic stats (branch, uncommitted, last commit)
- [ ] Project classification (remote URL + `_infra/project.yml`)
- [ ] fsnotify watcher + TTL cache infrastructure
- [ ] Emit `spec.json` to `~/.bridge/` (mode 0600)
- [ ] `bridge scan` CLI command with `--json` flag
- [ ] `bridge rpc scan` and `bridge rpc projects` commands
- [ ] First-run onboarding flow (interactive ignore list setup)
- [ ] Per-project `errors` array for partial failures
- **Tests**: unit tests for discovery (mock filesystem), git stat parsing, classification logic, TTL cache expiry, symlink dedup. Integration test: scan a temp dir tree → validate spec.json schema.

### M1: Colony Map
- [ ] Web project scaffold in `web/`
- [ ] Load spec.json, render treemap of all projects
- [ ] Color by classification (public/internal/personal)
- [ ] Size by LOC or file count
- [ ] Click tile → detail drawer (git stats, path, remote)
- [ ] Activity pulse (opacity/glow based on recency)
- [ ] Loading state for initial scan
- [ ] Empty state when no projects found
- [ ] `bridge serve` starts scanner + web server
- **Tests**: spec loader unit tests, treemap layout snapshot tests, WebSocket reconnection test.

### M2: Alerts & Vitals
- [ ] Scanner: port scanning (lsof) with multi-strategy project mapping
- [ ] Scanner: process tree, Docker containers
- [ ] Scanner: GitHub/GHE PR polling (batched, with TTL cache + exponential backoff)
- [ ] Scanner: Buildkite CI status polling (batched, with TTL cache + exponential backoff)
- [ ] Alert generation (stale PRs, failing CI, uncommitted changes, large stash)
- [ ] Web: alert badges on tiles
- [ ] Web: vitals drawer for selected project
- [ ] Web: infrastructure overlay (ports, services, containers)
- [ ] `bridge alerts` and `bridge rpc alerts` commands
- [ ] `bridge query` with filter support
- **Tests**: port → project mapping unit tests (all strategies), alert generation from mock spec data, CI/PR polling with rate limit simulation, graceful degradation when APIs unreachable.

### M3: Priority & Actions
- [ ] ONI-style 1-9 priority system
- [ ] Priority affects tile ordering/size
- [ ] Actions: open in editor, open in terminal, open PR in browser, jump to branch, open specific build
- [ ] `bridge status` CLI quick summary (human + `--json`)
- [ ] `bridge priority` and `bridge ack` write commands
- [ ] User config overlay (`~/.bridge/config.json`)
- [ ] Custom project groups
- [ ] Config validation (bad JSON, invalid globs → logged, skipped, not fatal)
- [ ] launchd plist for `bridge serve` daemon
- **Tests**: priority sort/layout tests, config validation edge cases, CLI write commands round-trip (set priority → read spec → verify).

### M4a: Overlays & Cycle Reports
- [ ] Overlay toggle system — see [OVERLAYS.md](./OVERLAYS.md)
- [ ] Git overlay, CI overlay, Infra overlay, Priority overlay
- [ ] Daily/weekly cycle report generation with actionable insights (not just metrics)
- [ ] Cycle report panel in web UI
- [ ] Keyboard shortcuts for overlay switching
- **Tests**: overlay state management, cycle report generation from mock data, overlay rendering snapshots.

### M4b: Delight & Polish
- [ ] Sound effects (build pass/fail, alerts, interactions) — commit fully or skip entirely
- [ ] Particle effects on achievements
- [ ] Smooth zoom transitions
- [ ] Search UI (fuzzy project search, keyboard-driven)
- [ ] Volume/toggle in settings
- **Tests**: search fuzzy matching, audio toggle state persistence.

### M5: Fractal Integration
- [ ] Move fractal into `bridge/fractal/`
- [ ] Extract shared render primitives to `packages/render/`
- [ ] Drill-down from project tile → fractal codebase view
- [ ] Shared camera/zoom/interaction model
- **Tests**: render primitive unit tests, drill-down navigation integration test.

### M6: Branch Dashboard Absorption
- [ ] Absorb branch-dashboard collection logic into scanner
- [ ] Terminal tab/pane tracking (abstracted — not iTerm-specific)
- [ ] Pi session topic integration
- [ ] Tab tags / workspace view in Bridge UI
- **Tests**: terminal detection abstraction tests, pi session topic parsing.

## Non-Goals (for now)

- Not a task manager (Asana is the system of record)
- Not an IDE (open in editor, don't edit in Bridge)
- Not a deployment tool (show CI status, don't trigger deploys... yet)
- Not multi-machine (single machine only)
- Not collaborative (single user)
- Not an MCP server (agents use `bridge rpc` CLI, not MCP protocol)

## Resolved Questions

1. **WebSocket vs polling** → Both. Scanner writes spec.json to disk (for CLI/agents) AND pushes deltas via WebSocket (for live UI). Web reconnects on disconnect and resyncs from spec.json.
2. **launchd integration** → Yes, at M3. `bridge serve --install` creates a launchd plist.
3. **Fractal migration timing** → M5. Fractal stays standalone until then. Shared rendering extracted when proven needed.
4. **Sound library** → Web Audio API + CC0 samples. Commit fully at M4b or skip entirely — half-implemented is worse than none.
5. **Scan roots default** → `~/` with first-run onboarding to customize ignore list.
6. **Auth** → Reuse existing CLI auth (`gh`, `bk`, `asana`). No dedicated credentials.
7. **Partial failures** → Per-project `errors` array. Scanner never fails because one project/API is broken.
8. **Monorepo IDs** → Full relative path: `project:code/mono/packages/foo`.
9. **Agent API** → `--json` on all commands + `bridge rpc` subcommand. No MCP.
10. **Write API** → Agents write to config.json via CLI (`bridge priority`, `bridge ack`). Scanner remains sole spec writer. Unidirectional data flow preserved.

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Scanner | Go | Fast system scanning, single binary, reuse fractal Go patterns |
| Web UI | TypeScript + Bun | Fast iteration, Canvas2D for colony map, HTML for panels |
| Rendering | Canvas2D | Proven in fractal, sufficient for treemap + effects |
| Audio | Web Audio API | Browser-native, low latency |
| Data format | JSON | Human-readable, agent-friendly |
| Spec storage | `~/.bridge/` | User-level, survives project changes |
| CLI | Go (same binary as scanner) | `bridge scan`, `bridge serve`, `bridge status`, `bridge rpc` |
