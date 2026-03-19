# Bridge

Dev environment colony map: Go scanner → `~/.bridge/spec.json` → TypeScript Canvas2D web dashboard.

## Build & Run

- Scanner: `cd scan && go build ./cmd/bridge/ && ./bridge scan`
- Web: `cd web && bun install && bun run dev`
- Both: `bridge serve` (starts scanner daemon + web server on :7400)

## Test

- Scanner: `cd scan && go test ./...`
- Web: `cd web && bun test`

## Lint

- Scanner: `cd scan && go vet ./...`
- Web: `cd web && bun run tsc --noEmit`

## Key Invariants

- `spec/bridge-spec.schema.json` is the contract between scanner and web
- Scanner emits to `~/.bridge/spec.json`
- User config lives at `~/.bridge/config.json` (overlays, never replaces, auto-detection)
- Web dashboard is read-only against the spec (scanner owns writes)
- Fractal lives in `fractal/` as a separate tool, will share `packages/render/` later

## Architecture

- Scanner: `cmd/bridge/main.go` → `discover.Walk()` → `git.Stats()` → `infra.Scan()` → `spec.Emit()`
- Web: `loadSpec()` → `computeLayout()` → `render()` loop with interaction handlers
