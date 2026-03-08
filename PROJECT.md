# Project: YTM Enhancer

## Overview

YTM Enhancer is a modular, cross-browser WebExtension for YouTube Music.

The extension is intentionally scoped as an enhancement layer on top of the
native YouTube Music web app. It does not replace the app, fork it, or wrap it
in a custom shell.

The codebase is organized so features can be added, removed, and tested in
small, self-contained modules.

## Scope and Philosophy

YTM Enhancer is built around a few constraints:

- Keep YouTube Music as the primary UI and playback surface.
- Prefer browser-native APIs and WebExtension-compatible patterns.
- Keep permissions narrow and avoid remote services when possible.
- Degrade gracefully when an API is unavailable in a browser.
- Optimize for maintainability over cleverness.

## Current Feature Surface

The project currently includes these user-facing modules:

- Quick Settings (tab source selection, now playing, key controls)
- Auto Play
- Auto Skip Disliked
- Audio Visualizer
- Hotkeys
- Mini Player (PiP behavior and controls)
- Notifications
- Sleep Timer
- About

Supporting embedded controls are provided by:

- Playback Speed
- Stream Quality
- Precision Volume

## Runtime Architecture

The runtime is split into three cooperating layers.

### 1. Background Service Worker (`src/background`)

The background script is the orchestration hub.

Responsibilities:

- Register and initialize feature modules.
- Persist and restore module state.
- Resolve and track the selected YTM tab.
- Handle cross-module and popup message requests.
- Relay playback and setting actions to content scripts.
- Coordinate alarms (for Sleep Timer) and extension lifecycle events.

The background now also emits lightweight popup refresh events where practical
(e.g., tab list and sleep timer state changes) to reduce popup polling.

### 2. Content Runtime (`src/content` + `src/adapter`)

The content script runs inside `music.youtube.com` and owns DOM interaction.

Responsibilities:

- Read playback state from the live YTM DOM via the adapter.
- Execute playback actions in the page context.
- Observe track/playback/dislike/player state changes.
- Host feature runtime pieces that must live in-page (visualizer, PiP, etc.).
- Bridge page-world integrations where needed (audio and quality bridges).

The adapter isolates selectors and page-specific logic so UI breakage fixes are
localized when YouTube Music changes markup.

### 3. Popup Runtime (`src/popup` + module popup views)

The popup is a modular shell with module-provided views.

Responsibilities:

- Render a stable navigation shell.
- Load module-specific settings/content views.
- Keep view rendering template-driven.
- Use message-based communication with background/content.

Popup views are now a mix of event-driven updates and targeted polling where a
live clock-like update is still necessary (for example, countdown display).

## Core Abstractions

Shared primitives live in `src/core` and are reused across modules:

- Extension context and module initialization
- Message sender/handler helpers
- Relay and tab-finding helpers
- Module state load/save utilities
- Type definitions for actions, playback state, and popup views

This layer is intentionally feature-agnostic.

## Module Model

Each module implements the `FeatureModule` contract and can provide:

- Background behavior and state
- Content-side behavior
- Optional popup view(s)

The target workflow for new functionality is:

1. Create a new module directory.
2. Implement module behavior behind the shared interfaces.
3. Register the module in background initialization.
4. Add popup view wiring only if the feature needs UI.
5. Add or update focused tests.

## Data Flow (High-Level)

Typical flow is message-driven:

1. Popup sends intent or query to background.
2. Background resolves policy/state/tab targeting.
3. Background responds directly, and/or relays to content script.
4. Content script interacts with YTM DOM through the adapter.
5. Content/background publish state changes back to popup when needed.

This keeps tab targeting and persistence centralized in one place.

## Browser and Platform Support

Primary targets:

- Chromium browsers (Chrome and Edge)
- Firefox with graceful fallback where APIs differ

Current notable divergence:

- Document PiP is Chromium-specific.
- Video PiP fallback behavior differs by browser capabilities.

## Build and Validation

Tooling stack:

- TypeScript (strict)
- Vite
- Vitest
- ESLint
- Prettier
- pnpm
- GitHub Actions

Primary scripts:

- `pnpm run format`
- `pnpm run format:check`
- `pnpm run lint`
- `pnpm run typecheck`
- `pnpm run test`
- `pnpm run build:chrome`
- `pnpm run build:edge`
- `pnpm run build:firefox`
- `pnpm run validate`
- `pnpm run package`

## Testing Strategy

The test suite mirrors `src/` layout and emphasizes:

- Unit tests for module and helper behavior
- Popup interaction tests for UI state and message wiring
- Integration-style flow tests for regressions in critical behaviors

Recent focus areas include selected-tab persistence, Sleep Timer ephemerality,
and popup event-driven refresh behavior.

## Project Structure

```text
src/
  adapter/        # YTM DOM selectors and page action adapter
  background/     # Service worker orchestration and module wiring
  content/        # In-page runtime, observers, feature controllers
  core/           # Shared extension primitives and messaging helpers
  manifests/      # Chrome and Firefox manifest sources
  modules/        # Feature modules and popup view implementations
  popup/          # Popup shell, shared popup helpers, base styles
  types/          # Global/browser type declarations
tests/            # Mirrors src/ for module-focused coverage
scripts/          # Project maintenance scripts (e.g., dead CSS checks)
store/            # Version-controlled browser store metadata and assets
dist/
  chrome/         # Chrome build output
  edge/           # Edge build output
  firefox/        # Firefox build output
```

## Non-Goals

YTM Enhancer does not aim to provide:

- A replacement YouTube Music client
- Backend services or telemetry pipelines
- Media downloading
- OS-level audio routing or system-level audio processing
- A full reimplementation of YouTube Music UI

## Direction

The current direction is incremental quality:

- Keep modules independently evolvable.
- Prefer narrow, clean commits.
- Reduce fragile polling where event-driven updates are viable.
- Continue strengthening tests around behavioral regressions.
