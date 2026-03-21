# Bridge

Dev environment colony map + battle station: Go scanner → `~/.bridge/spec.json` → React + Canvas2D web dashboard with agent sessions.

## Build & Run

- **Both:** `mise run dev` (scanner + web dev server, colored prefixed output)
- Scanner only: `cd scan && go build ./cmd/bridge/ && ./bridge scan`
- Web only: `cd web && bun run dev` (proxies `/api/*` and `/ws` → `:7400`)
- All mise tasks: `mise tasks` (dev, build, test, lint)
- Benchmark scanner: `cd scan && go build ./cmd/bridge/ && time ./bridge scan 2>&1 >/dev/null`

## Test

- Scanner: `cd scan && go test ./... -count=1`
- Web: `cd web && bun test`
- ⚠️ `mise run test` and `mise run lint` have a CWD bug (`cd scan` then `cd web` fails). Run separately.

## Lint

- Scanner: `cd scan && go vet ./...`
- Web: `cd web && bun run tsc --noEmit`

## Key Invariants

- `spec/bridge-spec.schema.json` is the contract between scanner and web — update both Go types (`scan/internal/spec/types.go`) AND TS types (`web/src/core/types.ts`) AND schema when changing spec shape
- Scanner emits to `~/.bridge/spec.json`
- User config lives at `~/.bridge/config.json` (overlays, never replaces, auto-detection)
- Web dashboard is read-only against the spec (scanner owns writes)
- Monorepo children are collapsed in the web UI by default (filter in `web/src/core/filter.ts`)
- Canvas stays vanilla TS — React only controls visibility and renders panel views
- Zustand store holds spec, active view, WS state; canvas bridge subscribes imperatively
- `main.tsx` owns initial data load + WS; bridges to both store and canvas handle

## Architecture

- Scanner: `cmd/bridge/main.go` → `discover.Walk()` → `git.GetStats()` → `discover.CollectSize()` → `spec.Emit()`
  - Walk: finds git repos under scan roots (~50ms for 108 repos)
  - BuildSpec: parallel workers (up to 8) process each repo
  - Per repo: `git status --porcelain --branch` + `git ls-files -z` (2 subprocesses), rest is filesystem reads
  - Monorepo children: skip LOC counting (parent already counted), only count deps
- Web: React shell (`App.tsx`) with 4 tab views: Complexity, Workspace, Colony, Sessions
  - Canvas views (Complexity, Colony): tab bar only, canvas visible + interactive
  - Panel views (Workspace, Sessions): canvas hidden, React renders full panel
  - Canvas lifecycle: `initCanvas()` → `CanvasHandle` (destroy/setVisible/updateSpec) in `canvas/bridge.ts`
  - Data flow: `main.tsx` → `loadSpec()` + `connectWS()` → zustand store + canvas handle
- Live updates: scanner → WebSocket `full_sync` → store → canvas `updateSpec()`
- URL routing: hand-rolled pushState (`/`, `/workspace`, `/colony`, `/sessions`)
- fsnotify watches `.git/` dirs; CHMOD events are ignored (always noise); noisy git internal files (fsmonitor, lock files, FETCH_HEAD) are filtered
- Agent sessions will be managed by Go server directly (no separate sidecar) — see `docs/BATTLE-STATION.md`

## Scanner Performance

Scans ~108 git repos + 617 monorepo children in ~4s. Key design choices:
- **git ls-files** over filepath.Walk — reads git index directly, avoids stat() per file
- **Tiered LOC counting**: exact (≤500 files), sampled 200 files (≤5K), heuristic `files×40` (>5K). `Size.Approx` flag when estimated.
- **Filesystem reads over git subprocesses**: stash from `.git/logs/refs/stash`, branches from `.git/refs/heads/`, remote URL from `.git/config`, last commit from `.git/logs/HEAD`
- **shouldSkipGitFile**: uses `IndexByte` scanning + map lookup (was 40% of CPU with filepath.Match)
- **countCommitsThisWeek**: skipped entirely if last commit > 7 days ago
- ⚠️ **Cache is NOT wired up** — `watch/cache.go` exists (TTL tiers, invalidation) but `BuildSpec` never uses it. Every rescan recomputes all 725 projects. Wiring cache = rescans in ~50ms instead of ~4s.

## Web Conventions

- Inline styles only (`const styles: Record<string, React.CSSProperties> = {...}`), no CSS files
- Pure logic in `*-utils.ts` files, components import them (e.g. `filter-utils.ts`, `attention-utils.ts`)
- `web/src/agent/commands.ts` — WS command helpers, components import directly
- `web/src/ui/time.ts` — shared `relativeTime(date, "verbose"|"terse")` helper
- Tests colocated: `foo.test.ts` next to `foo.ts`
- 155 web tests as of Phase 4

## Phase Status

See `docs/BATTLE-STATION.md` for full plan. Phases 1–4 complete.
- Scanner populates: git status, branches, activity, size. PRs/CI types exist but not yet collected (no GitHub API).
- Sessions: Go spawns `pi --mode rpc` child processes, relays over WS

## Multi-Agent Awareness

- Multiple agents may work in this repo concurrently
- Only `git add` and commit files YOU changed — check `git status` and `git diff` before committing
- Don't commit untracked files you didn't create
