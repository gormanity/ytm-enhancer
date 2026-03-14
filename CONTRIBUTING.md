# Contributing to YTM Enhancer

Thank you for contributing to YTM Enhancer.

This guide is for developers who want to report issues, submit fixes, or add new
modules.

## Before You Start

- Read [PROJECT.md](PROJECT.md) for architecture and scope.
- Keep changes small and focused.
- Prefer clear behavior over clever implementation.
- Preserve cross-browser behavior (Chrome + Edge + Firefox) whenever possible.

## Local Setup

1. Clone the repository.
2. Install dependencies: `pnpm install`
3. Run the test suite once: `pnpm run test`

## Development Commands

- Format write: `pnpm run format`
- Format check: `pnpm run format:check`
- Lint: `pnpm run lint`
- Typecheck: `pnpm run typecheck`
- Tests: `pnpm run test`
- Dead popup CSS check: `pnpm run css:dead`
- Build Chrome: `pnpm run build:chrome`
- Build Edge: `pnpm run build:edge`
- Build Firefox: `pnpm run build:firefox`
- Full validation: `pnpm run validate`
  - Runs format, format check, lint, dead CSS check, typecheck, tests, and all
    browser builds (Chrome, Firefox, Edge).

## Browser Store Build Policy

YTM Enhancer ships distinct builds per browser store target.

Today that means:

- Chrome build for Chrome Web Store submission
- Edge build for Microsoft Edge Add-ons submission
- Firefox build for Firefox Add-ons submission

Do not treat one browser bundle as interchangeable with another store. Always
validate and submit the browser-specific build artifact.

## Contribution Workflow

1. Create a focused change.
2. Implement with tests.
3. Run validation locally: `pnpm run validate`
4. Open a PR with clear scope and verification notes.

## Commit and Change Discipline

- Keep commits atomic.
- Do not mix unrelated concerns in one commit.
- If a change drifts, split it into multiple commits.
- Use descriptive commit messages.

Examples:

- `fix: prevent autoplay on reload when disabled`
- `test: cover sleep timer ephemerality lifecycle`
- `refactor: replace popup polling with runtime events`
- `docs: update module architecture section`

## Adding a New Module

YTM Enhancer is module-first. New features should be added as modules, not woven
into existing modules.

### 1. Create the Module Directory

Create:

- `src/modules/<module-name>/index.ts`
- Optional popup files:
  - `src/modules/<module-name>/popup.ts`
  - `src/modules/<module-name>/popup.html`

### 2. Implement the Module Contract

Implement `FeatureModule` with module lifecycle hooks.

Use module-local state and keep side effects scoped.

### 3. Register the Module in Background

In `src/background/index.ts`:

- Instantiate the module.
- Add it to the `modules` array.
- Wire message handlers only if needed.

### 4. Register Popup View (If Needed)

In `src/modules/popup-views.ts`:

- Add the popup view factory to `getAllPopupViews()`.
- Add an icon entry in the local `ICONS` map.

### 5. Add Tests

Mirror source structure in tests:

- `tests/modules/<module-name>/...`

Cover:

- Core behavior
- State transitions
- Popup behavior (if applicable)
- Message handler behavior

### 6. Validate Cross-Browser Behavior

If using browser-specific APIs:

- Gate behavior behind capability checks or graceful fallbacks.
- Verify Chrome, Edge, and Firefox builds succeed.

## Popup Binding Helpers

Shared helpers in `src/popup/` wire HTML template elements to background
messaging. Use these instead of writing manual `sendMessage` get/set boilerplate
in popup views.

- `bindToggle` — checkboxes
- `bindSelect` — select dropdowns

See [docs/popup-helpers.md](docs/popup-helpers.md) for API reference, usage
examples, and guidelines on when manual wiring is still appropriate.

## Coding Guidelines

- TypeScript strict mode only.
- Keep public APIs narrow and typed.
- Isolate YouTube Music DOM interactions to adapter/content runtime.
- Prefer event-driven updates over polling where practical.
- Keep popup rendering template-driven.
- Use shared popup binding helpers for standard controls.
- Avoid introducing dead code or unused exports.

## Testing Expectations

At minimum, each PR should include:

- New or updated tests for changed behavior
- Regression tests for bug fixes
- No drop in existing suite pass rate

When a bug was user-visible, include a test that would fail before the fix.

## Documentation Expectations

Update docs when behavior changes:

- End-user behavior: update `README.md`
- Architecture/scope: update `PROJECT.md`
- Contributor workflow/module process: update `CONTRIBUTING.md`

## Pull Request Checklist

- [ ] Scope is focused and clear.
- [ ] Formatting, lint, typecheck, and tests pass.
- [ ] Chrome, Edge, and Firefox builds pass.
- [ ] New behavior is covered by tests.
- [ ] Relevant docs are updated.
- [ ] No unrelated file churn.

## Reporting Issues

When filing an issue, include:

- Browser and version
- OS
- Steps to reproduce
- Expected behavior
- Actual behavior
- Screenshots or console errors when relevant

Clear repro steps are the fastest path to a fix.
