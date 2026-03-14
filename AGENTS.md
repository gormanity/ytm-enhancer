# Agent Guidelines

Read `PROJECT.md` for project context, architecture, tech stack, and philosophy.

This file covers **how to work**, not what the project is.

---

## Language

- Use exclusively American English in all code, comments, documentation, and
  commit messages.

---

## VCS

- Use `jj` exclusively. Never use raw `git` commands.
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
  browser builds) and only push when they pass.
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

- Before tagging any release, run `pnpm run validate` locally and ensure it
  passes.
- Ensure `main` is at the intended release commit before creating a tag.
- Create a semantic version tag (for example: `v0.1.0`) on the release commit.
- Push/update the tag on GitHub and verify the `Release` workflow completes
  successfully.
- Verify the corresponding `CI` workflow on `main` is green.
- Write release notes from the end-user perspective:
  - Focus on what changed for users, what improved, and any known limitations.
  - Avoid internal implementation details unless they affect user behavior.

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

All checks must pass before pushing.

After each feature change cycle, run both `build:chrome` and `build:firefox` so
the extension can be optested.

## Change Cycle Checklist

- After every change cycle (even if small), run `pnpm run format`.
- After formatting, run `pnpm run format:check` as part of validation.
- After every change cycle (even if small), rebuild both targets:
  `pnpm run build:chrome` and `pnpm run build:firefox`.
- Do not consider a feature cycle complete until both builds finish
  successfully.

---

## Formatting

- Prettier handles code formatting — do not manually format.
- Markdown files must have 80-character line limits.

---

## Popup Binding Helpers

Use shared helpers in `src/popup/` for standard popup controls:

- `bindToggle` — checkbox get/set wiring
- `bindSelect` — select dropdown get/set wiring

See [docs/popup-helpers.md](docs/popup-helpers.md) for full API reference.

---

## Adding a New Module

1. Create `src/modules/<module-name>/`.
2. Implement the `FeatureModule` interface.
3. Register the module in `src/background/index.ts`.
4. Optionally register a popup view in `src/modules/popup-views.ts`.
5. Use shared popup binding helpers for standard controls.
6. Write tests in `tests/modules/<module-name>/`.
7. No changes to existing modules should be required.
