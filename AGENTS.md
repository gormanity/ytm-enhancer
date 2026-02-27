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
- Use `jj split` to break apart changes that touch
  unrelated concerns (e.g., a selector fix vs. a new module).
- `jj split` accepts filesets as positional arguments for
  non-interactive splitting:
  `jj split -m "description" 'glob:src/adapter/**'`
- Use `jj new -m "description"` to start a new change before
  working on the next logical unit.
- Push workflow: `jj bookmark set main -r @-` then
  `jj git push --bookmark main`.

---

## TDD Workflow

1. Write a failing test first.
2. Commit the failing test.
3. Implement until the test passes.
4. Commit the passing implementation.
5. Only then push.

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

---

## Formatting

- Prettier handles code formatting — do not manually format.
- Markdown files must have 80-character line limits.

---

## Adding a New Module

1. Create `src/modules/<module-name>/`.
2. Implement the `FeatureModule` interface.
3. Register the module in `src/modules/index.ts`.
4. Optionally register a popup view.
5. Write tests in `tests/modules/<module-name>/`.
6. No changes to existing modules should be required.
