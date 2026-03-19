# Bridge — Sound Design

> See [DESIGN.md](./DESIGN.md) for full project context.

Ships fully at M4b or not at all. Half-implemented audio is worse than none.

## Principle

Sounds reinforce the game feel — they're feedback loops that make Bridge satisfying to use. Every sound maps to a meaningful state change. No gratuitous audio.

## Sound Map

| Trigger | Sound | Notes |
|---|---|---|
| Build passed | Soft chime (ascending) | Positive reinforcement |
| Build failed | Warning tone (descending) | Attention without anxiety |
| Alert fired | Subtle ping | Non-intrusive notification |
| Alert resolved | Soft release tone | Closure |
| PR merged | Achievement sound (short fanfare) | Celebration |
| Tile click/select | Soft click | Tactile feedback |
| Overlay switch | Subtle whoosh | Context switch |
| Cycle report ready | Gentle bell | Daily checkpoint |

## Ambient Layer

- Low ambient hum that subtly shifts with system load
- Busier machine → slightly more active ambient
- Completely idle → near-silent
- Should never be distracting — think spaceship bridge idle hum

## Implementation

- **Web Audio API** — browser-native, low latency
- **CC0 samples** — no licensing concerns
- **Volume control** — global slider in settings panel
- **Mute toggle** — keyboard shortcut (M) + UI button
- **Per-category toggles** — ambient, alerts, interactions can be toggled independently
- **localStorage persistence** — volume/mute state persists across sessions

## Guidelines

- All sounds < 1 second (except ambient)
- No sounds on page load
- Sounds respect system "Do Not Disturb" if detectable
- First interaction unlocks Web Audio context (browser requirement)
