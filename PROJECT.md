# Project: YTM Enhancer

## Overview

YTM Enhancer is a modular, cross-browser extension that enhances the official
YouTube Music web experience.

It is a structured enhancement platform designed to support additional features
over time without architectural rewrites.

The project begins with two committed features:

1. Configurable hotkeys
2. Playback notifications

The architecture is intentionally modular to allow safe expansion in future
versions.

---

## Philosophy

YTM Enhancer is not a replacement for YouTube Music.

It does not:

- Repackage YouTube Music inside Electron
- Reimplement the full UI
- Attempt to fork or clone the product

Instead, it enhances the official web client.

We prefer:

> Native YouTube Music web app
>
> - A capable, modular browser extension

We may draw inspiration from Electron-based projects (such as plugin systems in
desktop wrappers), but our approach remains:

- Lightweight
- Browser-native
- Standards-based
- Maintainable without owning the full app surface

---

## Platform Scope

YTM Enhancer is designed to work across:

- Chromium-based browsers (Chrome, Edge, Brave, etc.)
- Firefox (where APIs allow)
- Desktop operating systems (macOS, Windows, Linux)

We do not narrowly target a single OS or browser.

Feature availability may vary based on browser APIs. The extension must degrade
gracefully where capabilities differ.

---

## Guiding Principles

- Reliability > cleverness
- Cross-browser compatibility
- Minimal permissions
- No analytics or tracking
- No remote services (unless explicitly required by a future module)
- Progressive enhancement

We prefer WebExtension standards and isolate browser differences behind
capability checks.

---

## Current Committed Feature Scope

### 1. Configurable Hotkeys

- User-configurable shortcuts (where supported)
- Play / Pause
- Next / Previous
- Focus YTM tab

Hotkeys remain foundational.

They must be:

- Fast
- Predictable
- Compatible across browsers
- Robust against UI changes

Where true global shortcuts are unavailable, behavior must degrade gracefully.

---

### 2. Playback Notifications

- Native browser notifications on track change
- Artwork, title, artist
- Toggleable in settings

Requirements:

- Lightweight state monitoring
- No remote calls
- Resilient to background lifecycle differences
- Cross-browser compatibility where supported

---

## Architectural Direction

The extension consists of three layers:

### 1. Core

Responsible for:

- Messaging orchestration
- Tab targeting
- Feature registration
- Event bus
- Centralized action execution
- Versioned storage
- Browser capability detection

The core contains no feature-specific logic.

---

### 2. YouTube Music Adapter

All DOM interaction is isolated here.

Responsibilities:

- Produce structured playback state snapshots
- Execute playback actions
- Encapsulate selectors

Feature modules must not directly interact with the DOM.

If YouTube Music changes its UI, fixes are made in one place.

---

### 3. Feature Modules

Each feature:

- Is self-contained
- Registers with the core
- Can be enabled/disabled
- Consumes structured playback state
- May register popup views

Features do not directly depend on one another.

New modules must be addable without refactoring existing modules.

---

## Popup Architecture (Critical)

The popup is a modular container.

It must:

- Support multiple views/pages
- Allow feature modules to register popup views
- Provide centralized navigation
- Separate:
  - Global settings
  - Feature settings
  - Feature-specific views

The popup shell remains stable as modules grow.

Adding a feature should require:

- Registering the module
- Optionally registering a popup view
- No restructuring of the popup framework

Popup scalability is a first-class design requirement.

---

## Potential Future Modules (Exploratory)

The following modules are not currently committed, but are viable candidates for
future exploration. These ideas are inspired in part by plugin systems in
Electron-based YouTube Music wrappers, while remaining compatible with a
browser-extension-first approach.

### 1. SponsorBlock Integration

- Skip sponsored segments in music videos (where applicable)
- Category toggles (sponsor, intro, outro, etc.)
- Whitelist controls
- Optional popup configuration view

Considerations:

- May require network access to external APIs
- Must maintain strong privacy stance
- Must remain optional and modular

---

### 2. Synced Lyrics Module

- Display synchronized lyrics overlay
- Support multiple lyrics providers (if feasible)
- User-selectable display preferences
- Optional romanization support
- Popup view for provider/settings configuration

Considerations:

- DOM injection must remain isolated
- External provider integrations must be optional
- Must degrade gracefully if lyrics unavailable

---

### 3. Visual Tweaks / Theme Module

- Optional CSS-based UI enhancements
- Transparency effects
- Layout simplifications
- Minor quality-of-life improvements

Considerations:

- Avoid deep UI rewrites
- All selector logic isolated in adapter layer
- Must not destabilize core functionality

---

### 4. Command Palette / Quick Actions

- Keyboard-accessible command interface
- Quick access to common actions
- Optional overlay or popup-based command surface

Considerations:

- Must not conflict with YouTube Music shortcuts
- Should align with hotkey-centric philosophy

---

### 5. Optional Experimental Modules

These are higher complexity and not prioritized:

- Audio processing (e.g., compression, volume curves)
- Ad-related behavior modifications
- Advanced playback automation

These would require careful review due to:

- Browser store policy considerations
- Increased maintenance complexity
- Cross-browser inconsistencies

---

## Explicit Non-Goals (For Now)

- Replacing YouTube Music with a custom shell
- Running local servers or background daemons
- OS-level audio routing control
- Media downloading
- Backend services
- Full UI reimplementation

The extension remains an enhancement layer — not a replacement client.

---

## Phase 1 Roadmap

### Phase 1A — Modular Foundation

- Core module system
- Feature registration system
- Popup view registration system
- Structured playback snapshot model
- Centralized action executor
- Browser capability abstraction layer
- Versioned storage

No feature expansion until this foundation is stable.

---

### Phase 1B — Configurable Hotkeys

- Modular hotkey implementation
- Browser capability detection
- Popup configuration UI
- Reliable tab targeting

---

### Phase 1C — Playback Notifications

- Track change detection
- Notification rendering
- Toggleable setting
- Graceful fallback behavior

---

## Success Criteria

- Hotkeys work wherever browser APIs allow
- Notifications fire reliably across supported browsers
- Popup scales cleanly as modules are added
- New modules can be introduced without modifying existing modules
- Selector changes require updates only in the adapter layer

---

## Tech Stack

- **Language:** TypeScript (strict mode)
- **Package manager:** pnpm
- **Bundler:** Vite
- **Test framework:** Vitest
- **Linting:** ESLint
- **Formatting:** Prettier
- **CI:** GitHub Actions

---

## Project Structure

```
src/
  core/           # Messaging, registration, event bus, storage
  adapter/        # YouTube Music DOM interaction layer
  modules/        # Self-contained feature modules
  popup/          # Modular popup shell
  background/     # Service worker / background script
  content/        # Content script entry point
  manifests/      # Browser-specific manifest files
tests/            # Mirrors src/ structure
dist/
  chrome/         # Chrome build output
  firefox/        # Firefox build output
```

---

## Versioning

- Minor versions: feature additions
- Patch versions: reliability and selector fixes
- Major versions: architectural shifts

The extension must remain:

- Cross-browser
- Maintainable
- Expandable
- Predictable
