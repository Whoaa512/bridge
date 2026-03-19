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
- **Ports**: what's listening, PID, process name, mapped back to projects
- **Docker**: running containers, their ports, health status, image info
- **Process tree**: CPU/mem per project working directory
- **Services**: dev servers, databases, watchers — linked to their parent project

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
│  - Emits bridge-spec.json + live WebSocket updates    │
└──────────────────────────────────────────────────────┘
```

### Component Breakdown

```
bridge/
├── scan/              # Go scanner daemon
│   ├── cmd/           # CLI entry point: `bridge scan`, `bridge serve`, `bridge status`
│   └── internal/
│       ├── discover/  # Project discovery (walk dirs, detect git, classify)
│       ├── git/       # Git status per repo (branches, uncommitted, ahead/behind)
│       ├── infra/     # Port scan, Docker, process tree
│       ├── ci/        # Buildkite + GitHub Actions polling
│       ├── tasks/     # Asana integration
│       └── spec/      # Bridge spec types + JSON emission
├── web/               # Web dashboard (TypeScript + Canvas2D)
│   └── src/
│       ├── core/      # Spec loader, state, WebSocket client
│       ├── canvas/    # Colony map renderer (treemap tiles, animations, effects)
│       ├── layout/    # Treemap + clustering algorithms
│       ├── overlays/  # Alerts, vitals, priority, infra map
│       ├── audio/     # Sound effects (alert chimes, activity sounds)
│       └── ui/        # HTML panels (drawer, cycle report, search)
├── fractal/           # Codebase visualizer (moved from ~/code/fractal)
│   ├── parse/         # Go parser (unchanged)
│   └── view/          # TS viewer (will share render lib with web/)
├── packages/
│   └── render/        # Shared Canvas2D rendering primitives
│       ├── treemap.ts # Squarified treemap layout
│       ├── camera.ts  # Pan/zoom/focus
│       ├── hit.ts     # Hit testing
│       └── effects.ts # Glow, pulse, particle effects
├── spec/              # JSON schemas (bridge-spec + fractal-spec)
└── docs/              # This doc + plans
```

### Why This Structure (Agent-Native)

- **Flat tool directories** — each tool (`scan/`, `web/`, `fractal/`) has its own build/test/lint. Agents can work in isolation.
- **Shallow nesting** — agents don't need to navigate deep hierarchies
- **Shared packages** — `packages/render/` extracted only when both `web/` and `fractal/view/` need it
- **Independent deployment** — scanner is a Go binary, web is a static site + dev server, fractal remains standalone

## The Bridge Spec

The contract between scanner and web UI. Analogous to fractal's `.fractal/` spec.

```
~/.bridge/
├── spec.json          # Full scan result
├── config.json        # User overrides (classifications, priorities, custom groups)
└── cache/             # Cached CI/PR/Asana data
```

### Spec Schema (draft)

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
      "id": "project:code/fractal",
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
      "subprojects": [],           // For monorepos
      "priority": 5,               // 1-9 ONI-style, user-set
      "flags": ["has_ci", "has_prs", "monorepo"]
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

```jsonc
// ~/.bridge/config.json
{
  "scanRoots": ["~/code", "~/work"],
  "ignore": [
    "node_modules", ".git", "vendor", "bazel-*",
    "Library", "Applications", ".Trash",
    "Dropbox", "Google Drive"
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
3. For each directory:
   a. Has .git? → git project
   b. Has _infra/project.yml? → internal airbnb project (may be monorepo child)
   c. Has package.json with workspaces? → monorepo, recurse children
   d. Has go.work or go.mod with replace directives? → multi-module Go project
   e. On manual include list? → custom project
   f. Otherwise → skip (not a project)
4. Don't recurse INTO git repos (except for monorepo sub-project detection)
5. Classify each project (remote URL → public/internal, _infra → internal, config override)
6. Collect git stats, match running ports, check CI/PRs
```

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

### Sound Design (stretch, but core to delight)

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

```bash
bridge                  # Open web dashboard (launches browser + scanner if needed)
bridge scan             # Run one-shot scan, emit spec.json
bridge serve            # Start scanner daemon + web server
bridge status           # Quick terminal summary (top alerts, active projects)
bridge status <project> # Detail for one project
bridge config           # Open config in $EDITOR
bridge priority <project> <1-9>  # Set project priority
```

## MVP Milestones

### M0: Scanner Foundation
- [ ] Go project scaffold in `scan/`
- [ ] Directory walker with ignore rules
- [ ] Git repo detection + basic stats (branch, uncommitted, last commit)
- [ ] Project classification (remote URL + `_infra/project.yml`)
- [ ] Emit `spec.json` to `~/.bridge/`
- [ ] `bridge scan` CLI command

### M1: Colony Map
- [ ] Web project scaffold in `web/`
- [ ] Load spec.json, render treemap of all projects
- [ ] Color by classification (public/internal/personal)
- [ ] Size by LOC or file count
- [ ] Click tile → detail drawer (git stats, path, remote)
- [ ] Activity pulse (opacity/glow based on recency)
- [ ] `bridge serve` starts scanner + web server

### M2: Alerts & Vitals
- [ ] Scanner: port scanning (lsof), process tree, Docker containers
- [ ] Scanner: GitHub/GHE PR polling
- [ ] Scanner: Buildkite CI status polling
- [ ] Alert generation (stale PRs, failing CI, uncommitted changes, large stash)
- [ ] Web: alert badges on tiles
- [ ] Web: vitals drawer for selected project
- [ ] Web: infrastructure overlay (ports, services, containers)

### M3: Priority & Actions
- [ ] ONI-style 1-9 priority system
- [ ] Priority affects tile ordering/size
- [ ] Light actions: open in editor, open in terminal, open PR in browser
- [ ] `bridge status` CLI quick summary
- [ ] User config overlay (`~/.bridge/config.json`)
- [ ] Custom project groups

### M4: Cycle Reports & Delight
- [ ] Daily/weekly cycle report generation
- [ ] Cycle report panel in web UI
- [ ] Sound effects (build pass/fail, alerts, interactions)
- [ ] Particle effects on achievements
- [ ] Smooth zoom transitions
- [ ] Overlay toggle system (git/CI/infra/priority views)

### M5: Fractal Integration
- [ ] Move fractal into `bridge/fractal/`
- [ ] Extract shared render primitives to `packages/render/`
- [ ] Drill-down from project tile → fractal codebase view
- [ ] Shared camera/zoom/interaction model

### M6: Branch Dashboard Absorption
- [ ] Absorb branch-dashboard collection logic into scanner
- [ ] iTerm tab/pane tracking
- [ ] Pi session topic integration
- [ ] Tab tags / workspace view in Bridge UI

## Non-Goals (for now)

- Not a task manager (Asana is the system of record)
- Not an IDE (open in editor, don't edit in Bridge)
- Not a deployment tool (show CI status, don't trigger deploys... yet)
- Not multi-machine (single machine only)
- Not collaborative (single user)

## Open Questions

1. **WebSocket vs polling** — scanner daemon pushes updates via WS, or web polls spec.json on interval? WS is more game-like (live updates).
2. **launchd integration** — should `bridge serve` install itself as a launchd service like branch-dashboard does?
3. **Fractal migration timing** — move fractal in at M5 or from the start? Starting separate keeps velocity high.
4. **Sound library** — Web Audio API is fine for browser. Which sounds? Need to source/create a small sound pack.

## Tech Stack

| Component | Technology | Rationale |
|---|---|---|
| Scanner | Go | Fast system scanning, single binary, reuse fractal Go patterns |
| Web UI | TypeScript + Bun | Fast iteration, Canvas2D for colony map, HTML for panels |
| Rendering | Canvas2D | Proven in fractal, sufficient for treemap + effects |
| Audio | Web Audio API | Browser-native, low latency |
| Data format | JSON | Human-readable, agent-friendly |
| Spec storage | `~/.bridge/` | User-level, survives project changes |
| CLI | Go (same binary as scanner) | `bridge scan`, `bridge serve`, `bridge status` |
