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
- Run `pnpm run package` to generate store submission zips.
- Write release notes from the end-user perspective:
  - Focus on what changed for users and what improved.
  - Do not include known limitations or internal implementation details.

---

## Commands

| Task            | Command                  |
| --------------- | ------------------------ |
| Install deps    | `pnpm install`           |
| Format check    | `pnpm run format:check`  |
| Format fix      | `pnpm run format`        |
| Lint            | `pnpm run lint`          |
| Type check      | `pnpm run typecheck`     |
| Test            | `pnpm run test`          |
| Build (Chrome)  | `pnpm run build:chrome`  |
| Build (Firefox) | `pnpm run build:firefox` |
| Dev build (all) | `pnpm run dev:build`     |

All checks must pass before pushing.

After each feature change cycle, run `pnpm run dev:build` so the extension can
be optested with debug logging enabled. Dev builds output to `dist-dev/` and
include a "(dev)" name suffix. Only run production builds (`build:chrome`,
`build:firefox`) for releases.

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

### Popup Binding Helpers (`src/popup/`)

Use shared helpers for standard popup controls:

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
4. Optionally register a popup view in `src/modules/popup-views.ts`.
5. Use shared popup binding helpers and UI components for standard controls.
6. Write tests in `tests/modules/<module-name>/`.
7. No changes to existing modules should be required.
