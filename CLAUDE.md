# Bridge

Dev environment colony map: Go scanner → `~/.bridge/spec.json` → TypeScript Canvas2D web dashboard.

## Build & Run

- **Both:** `mise run dev` (scanner + web dev server, colored prefixed output)
- Scanner only: `cd scan && go build ./cmd/bridge/ && ./bridge scan`
- Web only: `cd web && bun run dev` (proxies `/api/*` → `:7400`)
- All mise tasks: `mise tasks` (dev, build, test, lint)

## Test

- All: `mise run test`
- Scanner: `cd scan && go test ./...`
- Web: `cd web && bun test`

## Lint

- All: `mise run lint`
- Scanner: `cd scan && go vet ./...`
- Web: `cd web && bun run tsc --noEmit`

## Key Invariants

- `spec/bridge-spec.schema.json` is the contract between scanner and web
- Scanner emits to `~/.bridge/spec.json`
- User config lives at `~/.bridge/config.json` (overlays, never replaces, auto-detection)
- Web dashboard is read-only against the spec (scanner owns writes)
- Monorepo children are collapsed in the web UI by default (filter in `web/src/core/filter.ts`)
- Fractal lives in `fractal/` as a separate tool, will share `packages/render/` later

## Architecture

- Scanner: `cmd/bridge/main.go` → `discover.Walk()` → `git.Stats()` → `discover.CollectSize()` → `spec.Emit()`
- Web: `loadSpec()` → `filterProjects()` → `computeLayout()` (grouped treemap by classification) → camera transform → `render()` loop
- Live updates: scanner → WebSocket `full_sync` → web re-filters/re-layouts
- fsnotify watches `.git/` dirs; CHMOD events are ignored (always noise); noisy git internal files (fsmonitor, lock files, FETCH_HEAD) are filtered

## Multi-Agent Awareness

- Multiple agents may work in this repo concurrently
- Only `git add` and commit files YOU changed — check `git status` and `git diff` before committing
- Don't commit untracked files you didn't create
