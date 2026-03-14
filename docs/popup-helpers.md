# Popup Binding Helpers

Shared helpers in `src/popup/` wire HTML template elements to
`chrome.runtime.sendMessage` get/set patterns. They eliminate repetitive
boilerplate and enforce a consistent UX across popup views.

## Design

Popup views use HTML templates (loaded via Vite `?raw` imports and rendered with
`renderPopupTemplate`) for layout and structure. Behavioral wiring — disabling
controls until state loads, syncing with the background — is handled by these
TypeScript helpers.

Each helper follows the same lifecycle:

1. Find the element by `data-role` attribute.
2. Disable it.
3. Send a GET message to the background to fetch initial state.
4. On success, apply the state and enable the element.
5. On user interaction, send a SET message to the background.

If the target element is missing, the helper returns silently. This makes
helpers safe to call unconditionally.

## `data-role` naming convention

Every `data-role` value **must be unique** across all module HTML templates.
Since multiple module views can coexist in the popup DOM, collisions cause
helpers to bind to the wrong element.

**Rules:**

1. Prefix every `data-role` with the module name or a module-specific namespace
   (e.g., `notifications-toggle`, `sleep-start-btn`,
   `audio-visualizer-style-select`).
2. Use lowercase kebab-case.
3. Never use bare generic names like `toggle`, `select`, or `range` — always
   include the prefix.

The `pnpm run data-role:check` script (run as part of `pnpm run check`) enforces
both uniqueness and the prefix convention across all module templates.

---

## `bindToggle`

**File:** `src/popup/bind-toggle.ts`

Wire a checkbox `<input>` to a boolean get/set message pair.

### Usage

```typescript
import { bindToggle } from "@/popup/bind-toggle";

bindToggle(container, "my-feature-toggle", {
  getType: "get-my-feature-enabled",
  setType: "set-my-feature-enabled",
});
```

### HTML

```html
<input type="checkbox" data-role="my-feature-toggle" />
```

### Parameters

| Parameter         | Type          | Description                     |
| ----------------- | ------------- | ------------------------------- |
| `container`       | `HTMLElement` | Parent element to search within |
| `dataRole`        | `string`      | `data-role` attribute value     |
| `options.getType` | `string`      | Message type for fetching state |
| `options.setType` | `string`      | Message type for setting state  |

### Expected message protocol

**GET request:** `{ type: getType }` **GET response:**
`{ ok: boolean; data?: boolean }` **SET request:**
`{ type: setType, enabled: boolean }`

---

## `bindSelect`

**File:** `src/popup/bind-select.ts`

Wire a `<select>` element to a get/set message pair. Supports custom response
parsing, payload keys, and value transforms.

### Usage (simple)

```typescript
import { bindSelect } from "@/popup/bind-select";

bindSelect(container, "my-select", {
  getType: "get-my-value",
  setType: "set-my-value",
});
```

### Usage (with options)

```typescript
bindSelect(container, "playback-speed-select", {
  getType: "get-playback-speed",
  setType: "set-playback-speed",
  parseData: (data) => String(data ?? 1),
  setKey: "rate",
  transformValue: (v) => Number(v),
});
```

### HTML

```html
<select data-role="my-select">
  <option value="">Select…</option>
  <option value="a">Option A</option>
  <option value="b">Option B</option>
</select>
```

Placeholder options (`value=""`) are automatically removed on successful load.

### Parameters

| Parameter                | Type                                  | Default   | Description                                         |
| ------------------------ | ------------------------------------- | --------- | --------------------------------------------------- |
| `container`              | `HTMLElement`                         | —         | Parent element to search within                     |
| `dataRole`               | `string`                              | —         | `data-role` attribute value                         |
| `options.getType`        | `string`                              | —         | Message type for fetching state                     |
| `options.setType`        | `string`                              | —         | Message type for setting state                      |
| `options.setKey`         | `string`                              | `"value"` | Key name for the value in the SET message           |
| `options.parseData`      | `(data: unknown) => string`           | `String`  | Extract the select value from `response.data`       |
| `options.transformValue` | `(value: string) => unknown`          | identity  | Transform `select.value` for the SET payload        |
| `options.onLoaded`       | `(select: HTMLSelectElement) => void` | —         | Called after GET succeeds and the select is enabled |

### Expected message protocol

**GET request:** `{ type: getType }` **GET response:**
`{ ok: boolean; data?: unknown }` **SET request:**
`{ type: setType, [setKey]: transformValue(select.value) }`

The SET message is only sent when `select.value` is non-empty.

---

## `bindRange`

**File:** `src/popup/bind-range.ts`

Wire an `<input type="range">` to a get/set message pair. Optionally syncs a
paired number input, a display element, and/or a filled-track gradient.

### Usage (simple)

```typescript
import { bindRange } from "@/popup/bind-range";

bindRange(container, "my-range", {
  getType: "get-my-value",
  setType: "set-my-value",
});
```

### Usage (with options)

```typescript
bindRange(container, "quick-volume-range", {
  getType: "get-volume",
  setType: "set-volume",
  setKey: "volume",
  parseData: (data) => Math.round(((data as number) ?? 1) * 100),
  transformValue: (v) => v / 100,
  numberInputRole: "quick-volume-number-input",
  fillTrack: true,
  onLoaded: () => placeholder?.remove(),
});
```

### HTML

```html
<input type="range" min="0" max="100" value="0" data-role="my-range" />
```

### Parameters

| Parameter                 | Type                                | Default   | Description                                                                               |
| ------------------------- | ----------------------------------- | --------- | ----------------------------------------------------------------------------------------- |
| `container`               | `HTMLElement`                       | —         | Parent element to search within                                                           |
| `dataRole`                | `string`                            | —         | `data-role` attribute value                                                               |
| `options.getType`         | `string`                            | —         | Message type for fetching state                                                           |
| `options.setType`         | `string`                            | —         | Message type for setting state                                                            |
| `options.setKey`          | `string`                            | `"value"` | Key name for the value in the SET message                                                 |
| `options.parseData`       | `(data: unknown) => number`         | `Number`  | Extract the range value from `response.data`                                              |
| `options.transformValue`  | `(value: number) => unknown`        | identity  | Transform the range value for the SET payload                                             |
| `options.numberInputRole` | `string`                            | —         | `data-role` for a paired `<input type="number">` (bidirectional sync, clamped to min/max) |
| `options.displayRole`     | `string`                            | —         | `data-role` for a display element updated with `formatDisplay(value)`                     |
| `options.formatDisplay`   | `(value: number) => string`         | `String`  | Format the value for the display element                                                  |
| `options.fillTrack`       | `boolean`                           | `false`   | Render a filled-track gradient using `--accent-color`                                     |
| `options.onLoaded`        | `(range: HTMLInputElement) => void` | —         | Called after GET succeeds and the range is enabled                                        |

### Expected message protocol

**GET request:** `{ type: getType }` **GET response:**
`{ ok: boolean; data?: unknown }` **SET request:**
`{ type: setType, [setKey]: transformValue(numericValue) }`

---

## When not to use these helpers

These helpers cover the common "fetch initial state, sync on change" pattern.
Use manual wiring when:

- The control has side effects beyond sending a single message (e.g., disabling
  the toggle during SET and re-enabling on callback).
- Multiple controls share coupled state (e.g., audio visualizer tuning sliders
  that update per-style).
- The response shape requires updating multiple elements (e.g., notification
  field checkboxes).

---

## Adding new helpers

When adding a new shared helper:

1. Create `src/popup/bind-<element>.ts`.
2. Follow the same lifecycle pattern (find, disable, GET, enable, SET).
3. Add tests in `tests/popup/bind-<element>.test.ts`.
4. Document the helper in this file.
5. Migrate one module first as a proof of concept, then migrate remaining
   modules in separate, atomic changes.
