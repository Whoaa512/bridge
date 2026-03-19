# Bridge

Your dev environment as a living colony map. Scan your machine, see every project, service, and resource — rendered ONI-style with alerts, priorities, and delight.

## Quick Start

```bash
bridge scan    # One-shot scan → ~/.bridge/spec.json
bridge serve   # Scanner daemon + web dashboard on :7400
bridge         # Open dashboard in browser
bridge status  # Terminal summary
```

## How It Works

**Scanner** (Go): walks your home directory, discovers git repos and projects, collects git stats, scans ports/Docker/processes, polls CI/PRs/Asana. Emits a JSON spec to `~/.bridge/`.

**Web Dashboard** (TypeScript + Canvas2D): loads the spec, renders an interactive colony map. Projects as treemap tiles with health indicators, alerts, overlays. Click to drill down, open in editor, open PRs in browser.

**CLI**: quick access to scan results, priority management, config.

## Project Structure

```
bridge/
├── scan/          # Go scanner + CLI
├── web/           # Browser dashboard (Canvas2D colony map)
├── fractal/       # Codebase visualizer (future merge)
├── packages/
│   └── render/    # Shared Canvas2D rendering primitives
├── spec/          # JSON schemas
└── docs/          # Design docs
```

## Status

Pre-alpha. See `docs/DESIGN.md` for full design.
