# Agent Guidelines

Read `PROJECT.md` for project context, architecture, tech stack, and philosophy.

This file covers **how to work**, not what the project is.

---

## Language

- Use exclusively American English in all code, comments, documentation, and
  commit messages.

---

## VCS

- Use `jj` exclusively. The one exception is `git push origin <tag>` for pushing
  tags, since `jj git push` does not support tags.
- Make changes atomic and tightly scoped.
- Write descriptive change descriptions.
- Start change descriptions with a Conventional Commits-style prefix:
  `<type>(<scope>): <short summary>`. Use the scope for the module, subsystem,
  or docs area, e.g. `fix(menu-bar): align footer actions`,
  `test(connectors): cover native host gating`, or
  `docs(agents): document commit message style`.
- Prefer `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `build`, `ci`, and
  `style` as the type. Use another type only when it is clearer.
- Use `jj split` to break apart changes that touch unrelated concerns (e.g., a
  selector fix vs. a new module).
- `jj split` accepts filesets as positional arguments for non-interactive
  splitting: `jj split -m "description" 'glob:src/adapter/**'`
- **Before starting any new work**, run `jj status`. If the current change
  already has content, run `jj new` before making changes. Never lump unrelated
  work together.
- Push workflow: `jj bookmark set main -r @-` then
  `jj git push --bookmark main`.
- **Do not push until all feature work is complete.** Keeping intermediate
  changes local preserves the option to revise earlier commits with `jj squash`
  or `jj edit`. Push once the feature is done and all checks pass.
- **Before every push**, run CI-equivalent checks locally (`pnpm run check` plus
  `pnpm run dev:build`) and only push when they pass.
- **After every push**, verify the GitHub Actions CI run for that push has
  completed successfully.

---

## TDD Workflow

1. Write a failing test first.
2. Commit the failing test.
3. Implement until the test passes.
4. Commit the passing implementation.
5. Only then push.

---

## Release Process

- Bump the version in `package.json` (the only source of truth — manifest
  versions are injected at build time).
- Commit the version bump, push, and ensure CI is green.
- Before tagging, run `pnpm run validate` locally and ensure it passes.
- Create a semantic version tag: `jj tag set v0.X.Y -r @-` then
  `git push origin v0.X.Y`.
- Verify the `Release` workflow completes successfully.
- Return a direct link to the GitHub release in the final release close-out.
- Review `store/STORE.md` and generated store assets for release accuracy,
  clarity, browser-store fit, and end-user value. Recommend copy changes before
  finalizing store submissions.
- Run `pnpm run package` to generate store submission zips.
- Run `pnpm run lint:addons:firefox:zip` to validate the Firefox submission zip
  with Mozilla's add-on linter.
- Write release notes from the end-user perspective:
  - Organize notes by module when the release includes changes across multiple
    modules.
  - Focus on what changed for users and what improved.
  - Do not include known limitations or internal implementation details.
  - Draft the notes for manual approval before publishing or updating the GitHub
    release.
  - After approval, add the approved notes to the GitHub release.
- Menu bar connector releases are separate from extension releases. Use
  `menu-bar-vX.Y.Z` tags and follow `docs/menu-bar-release.md`.

---

## Commands

| Task                     | Command                   |
| ------------------------ | ------------------------- |
| Install deps             | `pnpm install`            |
| Format check             | `pnpm run format:check`   |
| Workflow lint            | `pnpm run workflow:check` |
| Format fix               | `pnpm run format`         |
| Lint                     | `pnpm run lint`           |
| Type check               | `pnpm run typecheck`      |
| Test                     | `pnpm run test`           |
| Build (Chrome)           | `pnpm run build:chrome`   |
| Build (Firefox)          | `pnpm run build:firefox`  |
| Dev build (stack tip)    | `pnpm run dev:build`      |
| Dev build (working copy) | `pnpm run dev:build:wc`   |

All checks must pass before pushing.

Install `actionlint` locally with `brew install actionlint` before running
`pnpm run workflow:check`. CI enforces workflow linting with `rhysd/actionlint`.

After each feature change cycle, run `pnpm run dev:build` so the extension can
be optested with debug logging enabled. Dev builds output to `dist-dev/` and
include a "(dev)" name suffix. Only run production builds (`build:chrome`,
`build:firefox`) for releases.

`pnpm run dev:build` always builds the local stack tip — if `@` is mid-stack, it
transparently switches `@` to the tip, builds, and restores `@`. Use
`pnpm run dev:build:wc` to build the working-copy revision exactly as it sits.

When developing new features or debugging bugs, add targeted debug logging with
the existing debug logger where it helps verify runtime behavior in the dev
build. Keep debug output focused on decision points, browser/API differences,
and selector or state detection. Remove or reduce temporary logging before
considering the change complete unless it remains useful for future debugging.

## Change Cycle Checklist

- After every change cycle (even if small), run `pnpm run format`.
- After formatting, run `pnpm run format:check` as part of validation.
- After every change cycle (even if small), run `pnpm run dev:build`.
- Do not consider a feature cycle complete until the dev build finishes
  successfully.

---

## Formatting

- Prettier handles code formatting — do not manually format.
- Markdown files must have 80-character line limits.

---

## Shared UI Library

### Module Runtime API (`src/core/`)

Use the module-facing runtime API for module work:

- Use `ModuleContext` capabilities instead of importing background globals or
  browser helpers directly.
- Use `context.ytm` for YouTube Music tab listing, selection, focus, playback
  state, playback actions, seeking, volume, speed, quality, and content
  broadcasts.
- Use `createPlaybackController()` with `createYtmPlaybackDriver()` for UI
  surfaces or hotkeys that issue playback actions, seek, and then need shared
  immediate/delayed refresh behavior.
- Use `context.runtime.request()` and `context.runtime.command()` for
  module-specific popup-to-background messages, preferably behind a small
  module-local client in `src/modules/<module-name>/client.ts`.
- Use `createRuntimeClient()` for module content/controller runtime messaging
  when a `ModuleContext` is not available.
- Use `context.commands` for browser shortcut listings, edits, resets, and
  opening the browser shortcuts page.
- Use `context.commands.getRegisteredCommands()` when popup UI needs to display
  command ownership metadata. The ownership source is
  `FeatureModule.registerHotkeys()`, not a duplicate popup map.
- Use `context.extension` for extension metadata and packaged asset URLs, such
  as the manifest version or notification icons.
- Use `context.alarms` for module-owned alarm scheduling and clearing.
- Use `context.notifications` for module-owned browser notification creation and
  clearing.
- Use `FeatureModule.registerHandlers()` for module-owned background handlers.
  Keep only global policy and browser lifecycle handlers in
  `src/background/index.ts`.
- Use `FeatureModule.registerHotkeys()` for module-owned browser command
  handlers. Keep `chrome.commands.onCommand` dispatch in core/background.
- Use `FeatureModule.registerAlarms()` for module-owned browser alarm handlers.
  Keep `chrome.alarms.onAlarm` dispatch in core/background.
- Use `FeatureModule.registerNotificationClicks()` for module-owned browser
  notification click handlers. Keep `chrome.notifications.onClicked` dispatch in
  core/background.
- Use `FeatureModule.syncContentState()` when restored module settings must be
  replayed to existing content runtimes after startup.
- Use `context.state.saveValue()` for persisted module state writes from
  background handlers.
- Use `context.storage` only for popup-local UI persistence that is not module
  runtime state.
- Use injected core browser clients, such as `createDocumentPipClient()`, for
  content-side module controllers that cannot receive `ModuleContext`.

See [docs/module-api.md](docs/module-api.md) for the full module API reference.

### Popup Binding Helpers (`src/popup/`)

Use module-facing shared helpers for standard popup controls:

- `bindModuleToggle` — checkbox get/set wiring through function clients
- `bindModuleSelect` — select dropdown get/set wiring through function clients
- `bindModuleRange` — range slider wiring through function clients
- `bindModuleCheckboxGroup` — grouped checkbox field wiring
- `bindModuleActionButton` — async action buttons with disabled-state handling

Use the lower-level helpers only for legacy or compatibility paths:

- `bindToggle` — checkbox get/set wiring
- `bindSelect` — select dropdown get/set wiring
- `bindRange` — range slider get/set wiring (inline label, slider, number input)

### UI Components (`src/ui/`)

Standalone components for any DOM context (popup, PiP, content script):

- `createProgressBar` + `progress-bar.css` — seekable progress bar with
  drag-to-seek, CSS custom property theming
- `createRangeSlider` + `range-slider.css` — inline range slider row with label,
  filled-track gradient, and number input

See [docs/shared-ui.md](docs/shared-ui.md) for full API reference.

---

## Adding a New Module

1. Create `src/modules/<module-name>/`.
2. Implement the `FeatureModule` interface.
3. Register the module in `src/background/index.ts`.
4. Use `getPopupViews(context)` when the module needs popup UI.
5. Use `registerHandlers(registry, context)` for module-owned background
   messages.
6. Use `registerHotkeys(registry, context)` for module-owned browser command
   handlers.
7. Use `registerAlarms(registry, context)` for module-owned browser alarm
   handlers.
8. Use `registerNotificationClicks(registry, context)` for module-owned browser
   notification click handlers.
9. Use `syncContentState(context)` when restored settings need content sync.
10. Wrap module-specific popup messages in a module-local client.
11. Use `context.ytm`, `context.runtime`, `context.state`, `context.alarms`,
    `context.notifications`, and `context.capabilities` instead of direct global
    helpers where possible.
12. Use `module-ui` helpers and shared UI components for standard controls.
13. Write tests in `tests/modules/<module-name>/`.
14. No changes to existing modules should be required.
