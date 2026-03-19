# Bridge — Overlay System Design

> See [DESIGN.md](./DESIGN.md) for full project context.

The overlay system is Bridge's core interaction pattern, directly inspired by ONI's overlay toggle. It transforms the same treemap data into different visual perspectives without changing layout.

## Concept

The colony map always shows the same treemap of project tiles. Overlays change what each tile *communicates* — its color, badges, labels, and effects — without repositioning tiles. This lets users build spatial memory ("fractal is top-right, twig is bottom-left") while switching informational lenses.

## Overlay List

| Key | Overlay | Tile Color | Badges | Glow/Effect | Primary Signal |
|---|---|---|---|---|---|
| `1` | **Default** | Classification (public/internal/personal) | Alert severity dots | Activity pulse | Overall health |
| `2` | **Git** | Uncommitted changes (green=clean, yellow=dirty, red=conflicts) | Branch name, ahead/behind count | Pulse on recent commits | Working copy state |
| `3` | **CI** | Build status (green/red/yellow/gray) | Build number, duration | Red pulse on failures | Build health |
| `4` | **Infra** | Has running services (lit=yes, dim=no) | Port numbers, process names | Glow intensity = CPU usage | Running infrastructure |
| `5` | **Priority** | Heat map 1-9 (cool blue → hot red) | Priority number | None | What to work on |
| `6` | **Activity** | Temperature (cold blue=stale → warm orange=active) | Days since last touch | Fade out stale projects | Staleness |

## Interaction Model

### Switching
- **Keyboard**: number keys `1`-`6` toggle overlays instantly
- **UI**: overlay bar at top of canvas — row of labeled toggle buttons
- **Only one active at a time** — no composition. Simplicity > power. If we need composition later, we'll add it, but start with mutual exclusion.

### Transition
- Tile colors crossfade over 200ms
- Badges swap instantly (no animation — badges need to be readable)
- Effects (glow/pulse) transition over 300ms

### Persistence
- Active overlay stored in localStorage
- Persists across page reloads
- Default overlay on fresh load: `Default`

## Rendering Architecture

Each overlay is a pure function:

```typescript
type OverlayFn = (project: Project, spec: BridgeSpec) => TileStyle;

interface TileStyle {
  fillColor: string;
  borderColor: string;
  opacity: number;
  badges: Badge[];
  glowColor: string | null;
  glowIntensity: number;    // 0-1
  pulseSpeed: number;       // 0=none, 1=slow, 3=fast
  label: string;            // Tile label override (usually project name)
  sublabel: string | null;  // Secondary text below label
}
```

The canvas renderer doesn't know about overlays — it just renders `TileStyle`. The overlay system is a mapping layer between spec data and visual output.

### Overlay Registry

```typescript
const overlays: Record<string, OverlayFn> = {
  default: defaultOverlay,
  git: gitOverlay,
  ci: ciOverlay,
  infra: infraOverlay,
  priority: priorityOverlay,
  activity: activityOverlay,
};
```

Adding a new overlay = writing one function + registering it. No framework, no inheritance, no plugins.

## Color Palettes

Each overlay has its own palette. Colors chosen for accessibility (distinguishable in common color blindness modes).

### Default Overlay
- Public: `#4A9EFF` (blue)
- Internal: `#FF8C42` (orange)
- Personal: `#7ED957` (green)

### Git Overlay
- Clean: `#2ECC71` (green)
- Dirty (uncommitted): `#F1C40F` (yellow)
- Conflicts: `#E74C3C` (red)
- Detached HEAD: `#95A5A6` (gray)

### CI Overlay
- Passed: `#2ECC71` (green)
- Failed: `#E74C3C` (red)
- Running: `#3498DB` (blue, animated pulse)
- Pending: `#F1C40F` (yellow)
- No CI: `#95A5A6` (gray, dimmed)

### Infra Overlay
- Running services: `#E67E22` (warm orange, glow)
- No services: `#2C3E50` (dark, dimmed)

### Priority Overlay
- 1 (lowest): `#3498DB` (cool blue)
- 5 (medium): `#F1C40F` (yellow)
- 9 (highest): `#E74C3C` (hot red)
- Unset: `#95A5A6` (gray)

### Activity Overlay
- Active today: `#E74C3C` (warm red-orange)
- Active this week: `#F1C40F` (yellow)
- Stale (>30 days): `#3498DB` (cold blue)
- Dormant (>90 days): `#2C3E50` (near-black, very dim)

## Legend

Each overlay shows a small legend in the bottom-left corner of the canvas:
- Color swatches with labels
- Appears on overlay switch, fades after 3s, reappears on hover over legend area

## Future Considerations

- **Composition**: if single-overlay proves limiting, could add a "split" mode (left half = CI, right half = Git). Not planned.
- **Custom overlays**: user-defined overlay functions. Not planned.
- **Overlay in CLI**: `bridge status --overlay=ci` could colorize terminal output. Nice-to-have.
