# Module API

This document covers the module-facing runtime API. Use it when adding or
refactoring modules so feature code stays behind stable typed capabilities
instead of importing background helpers or calling raw runtime messages.

The API has six layers:

1. `FeatureModule` and `ModuleContext` define module lifecycle and capabilities.
2. `YtmRuntimeClient` defines the typed surface for YouTube Music tabs.
3. `HotkeyRegistry` defines browser command dispatch owned by modules.
4. `AlarmRegistry` defines browser alarm dispatch owned by modules.
5. `NotificationClickRegistry` defines notification click dispatch owned by
   modules.
6. Popup helpers in `src/popup/module-ui.ts` define shared control wiring.

## Module Lifecycle

Every module implements `FeatureModule` from `src/core/types.ts`.

```typescript
export interface FeatureModule {
  id: string;
  name: string;
  description: string;

  init(context?: ModuleContext): void | Promise<void>;
  destroy(): void;
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;

  getPopupViews?(context?: ModuleContext): PopupView[];
  registerHandlers?(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void;
  registerHotkeys?(
    registry: HotkeyHandlerRegistry,
    context: ModuleContext,
  ): void;
  registerAlarms?(registry: AlarmHandlerRegistry, context: ModuleContext): void;
  registerNotificationClicks?(
    registry: NotificationClickHandlerRegistry,
    context: ModuleContext,
  ): void;
}
```

Use `init(context)` for background startup work, runtime listeners, alarms, and
other long-lived browser registrations. Disabled modules still register popup
views, but `init()` is only called for enabled modules.

Use `getPopupViews(context)` to return module popup views. The background path
receives the background context during `initializeModules()`. The actual popup
path receives a popup context from `createPopupModuleContext()`.

Use `registerHandlers(registry, context)` for module-owned background message
handlers. Keep global policy and browser lifecycle handlers in
`src/background/index.ts`.

Use `registerHotkeys(registry, context)` for module-owned browser command
handlers. The background script owns the `chrome.commands.onCommand` listener,
but feature modules own the command behavior.

Use `registerAlarms(registry, context)` for module-owned browser alarm handlers.
The background script owns the `chrome.alarms.onAlarm` listener, but feature
modules own the alarm behavior.

Use `registerNotificationClicks(registry, context)` for module-owned browser
notification click handlers. The background script owns the
`chrome.notifications.onClicked` listener, but feature modules own the click
behavior.

## Module Context

`ModuleContext` is the only capability bundle modules should need.

```typescript
export interface ModuleContext {
  events: EventBus;
  popup: PopupRegistry;
  capabilities: Capabilities;
  ytm: YtmRuntimeClient;
  runtime: RuntimeClient;
  state: {
    saveValue(key: string, value: unknown): Promise<void>;
  };
  storage: {
    get(keys: string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
  extension: ExtensionMetadataClient;
  commands: ShortcutCommandClient;
  alarms: AlarmSchedulerClient;
  notifications: NotificationClient;
  popupEvents: {
    broadcast(message: { type: string; [key: string]: unknown }): void;
  };
}
```

### `events`

Use for background-local coordination between modules and global policy.

Example: Auto Play emits `auto-play-policy-reset` when a mode change should
clear background autoplay-blocked tab state.

### `popup`

The background registry of popup views. Most modules do not need to use this
directly; returning `PopupView[]` from `getPopupViews()` is preferred.

### `capabilities`

Browser capability detection from `src/core/capabilities.ts`. Use this instead
of direct feature probes in module code when a capability is already defined.

Example: Mini Player reads `context.capabilities.documentPip` instead of
checking `documentPictureInPicture` directly in its popup.

### `ytm`

The typed YouTube Music runtime client. Use it for tab selection, focus,
playback state, playback actions, volume, speed, stream quality, and content
runtime broadcasts.

### `runtime`

Popup-safe background messaging. Use this for module-specific requests that are
not part of the generic YTM tab/playback API.

```typescript
const enabled = await context.runtime.request<boolean>({
  type: "get-notifications-enabled",
});

await context.runtime.command({
  type: "set-notifications-enabled",
  enabled: true,
});

const unsubscribe = context.runtime.subscribe((message) => {
  if (message.type === "sleep-timer-state-changed") {
    // Refresh popup state.
  }
});
```

### `state`

Background-side persisted module state writes. Use this from module handlers
after mutating in-memory module state.

```typescript
this.setEnabled(message.enabled as boolean);
await context.state.saveValue("mini-player.enabled", message.enabled);
```

State restore still happens in background startup so defaults, migration, and
cross-module restore sequencing stay in one place.

### `storage`

Popup-safe local storage access for popup-only state. Use it for UI affordances
that are not module runtime state.

Example: About uses `context.storage` for review prompt sentiment and dismiss
state.

### `commands`

Popup-safe browser shortcut access. Use this instead of calling browser command
or tab APIs directly from module popup views.

```typescript
const commands = await context.commands.getAll();

if (context.commands.canEdit()) {
  await context.commands.update("play-pause", "Alt+Shift+P");
} else {
  await context.commands.openShortcutsPage();
}
```

### `popupEvents`

Background-side best-effort popup broadcasts. Use this when a module owns a
state transition and popup views should refresh.

```typescript
context.popupEvents.broadcast({ type: "sleep-timer-state-changed" });
```

Popup broadcasts may have no listener. Code must treat them as best-effort.

## YTM Runtime Client

`YtmRuntimeClient` lives in `src/core/ytm-client.ts`.

```typescript
export interface YtmRuntimeClient {
  listTabs(): Promise<YtmTabListState>;
  selectTab(tabId: number | null): Promise<void>;
  focusTab(tabId?: number | null): Promise<void>;
  getTabArtwork(tabId: number): Promise<string | null>;
  getPlaybackState(target?: YtmTarget): Promise<PlaybackState>;
  executePlaybackAction(
    action: PlaybackAction,
    target?: YtmTarget,
  ): Promise<void>;
  seekTo(time: number, target?: YtmTarget): Promise<void>;
  getVolume(): Promise<number>;
  setVolume(volume: number): Promise<void>;
  getPlaybackSpeed(): Promise<number>;
  setPlaybackSpeed(rate: number): Promise<void>;
  getStreamQuality(): Promise<string | null>;
  setStreamQuality(quality: string): Promise<void>;
  broadcast(message: Record<string, unknown>): Promise<void>;
}
```

The background implementation centralizes:

- selected-tab resolution;
- fallback to any YTM tab where applicable;
- `No YTM tab` errors;
- dev-build suppression errors;
- content-script probing and injection retry;
- `chrome.tabs.sendMessage` response validation.

The popup implementation in `src/core/popup-context.ts` implements the same
interface by sending existing background messages. Popup modules should depend
on `context.ytm`, not on message names for generic YTM operations.

### Targeting

Most methods default to the selected YTM tab.

```typescript
await context.ytm.executePlaybackAction("next");
```

Use explicit targets when module behavior needs a specific tab or any available
tab.

```typescript
await context.ytm.getPlaybackState({ kind: "tab", tabId });
await context.ytm.executePlaybackAction("pause", { kind: "any" });
```

### Tab UI

Use `listTabs()`, `selectTab()`, `focusTab()`, and `getTabArtwork()` for popup
tab chips and now-playing UI.

```typescript
const state = await context.ytm.listTabs();
await context.ytm.selectTab(state.tabs[0]?.id ?? null);
await context.ytm.focusTab();
```

### Playback UI

Use the dedicated methods for common controls.

```typescript
const playback = await context.ytm.getPlaybackState();
await context.ytm.executePlaybackAction("togglePlay");
await context.ytm.seekTo(playback.progress + 10);
await context.ytm.setVolume(0.75);
await context.ytm.setPlaybackSpeed(1.25);
await context.ytm.setStreamQuality("2");
```

### Content Broadcasts

Use `broadcast()` for module settings that all YTM content runtimes should
observe.

```typescript
await context.ytm.broadcast({
  type: "set-audio-visualizer-enabled",
  enabled: true,
});
```

Broadcast is best-effort per tab. A tab that is navigating or missing a content
script must not fail the whole module state update.

## Runtime Client

`RuntimeClient` lives in `src/core/messaging.ts`.

```typescript
export interface RuntimeClient {
  request<TData = unknown>(message: Message): Promise<TData>;
  command(message: Message): Promise<void>;
  subscribe(
    listener: (message: Message, sender: chrome.runtime.MessageSender) => void,
  ): () => void;
}
```

Use `request<T>()` for messages that return data. Use `command()` for commands
where success or failure is enough. Both helpers unwrap the standard response
envelope and throw on `{ ok: false }`.

Use `subscribe()` for popup refresh events. Always call the returned cleanup
function from the popup view cleanup path when a view installs a listener.

Content-side module controllers that cannot receive `ModuleContext` should
accept an injected `RuntimeClient`, defaulting to `createRuntimeClient()`,
instead of calling `chrome.runtime.sendMessage()` directly.

### `extension`

Extension metadata and asset URL helpers. Use this instead of calling
`chrome.runtime.getManifest()` or `chrome.runtime.getURL()` from module code.

```typescript
const version = context.extension.getVersion();
const iconUrl = context.extension.getUrl("icon48.png");
```

### `alarms`

Browser alarm scheduling. Use this instead of calling `chrome.alarms` from
module code.

```typescript
await context.alarms.create("sleep-timer", { when: endAt });
await context.alarms.clear("sleep-timer");
```

### `notifications`

Browser notification creation and clearing. Use this instead of calling
`chrome.notifications` from module code.

```typescript
await context.notifications.create("now-playing", {
  type: "basic",
  title: "Now Playing",
  message: "Artist Name",
  iconUrl: context.extension.getUrl("icon48.png"),
});

await context.notifications.clear("now-playing");
```

## Module Handler Registry

`registerHandlers()` receives a `ModuleHandlerRegistry`.

```typescript
export interface ModuleHandlerRegistry {
  on(type: string, handler: MessageHandler): void;
}
```

Handlers should preserve existing public message names unless there is a strong
reason to change protocol. The goal is ownership, not protocol churn.

```typescript
registerHandlers(registry, context) {
  registry.on("get-auto-skip-disliked-enabled", async () => ({
    ok: true,
    data: this.isEnabled(),
  }));

  registry.on("set-auto-skip-disliked-enabled", async (message) => {
    this.setEnabled(message.enabled as boolean);
    await context.state.saveValue(
      "auto-skip-disliked.enabled",
      message.enabled,
    );
    await context.ytm.broadcast({
      type: "set-auto-skip-disliked-enabled",
      enabled: message.enabled,
    });
    return { ok: true };
  });
}
```

## Module Hotkey Registry

`registerHotkeys()` receives a `HotkeyHandlerRegistry`.

```typescript
export interface HotkeyHandlerRegistry {
  register(command: string, handler: CommandHandler): void;
}
```

Commands must also be declared in each browser manifest under `"commands"`. The
Hotkeys popup reads browser command metadata with `chrome.commands.getAll()`, so
newly declared commands appear there automatically.

```typescript
registerHotkeys(registry, context) {
  registry.register("my-command", async () => {
    await context.ytm.focusTab();
  });
}
```

## Module Alarm Registry

`registerAlarms()` receives an `AlarmHandlerRegistry`.

```typescript
export interface AlarmHandlerRegistry {
  register(name: string, handler: AlarmHandler): void;
}
```

Use `registerAlarms()` for behavior that should run when a browser alarm fires.
Use `context.alarms` for scheduling and clearing those alarms.

```typescript
registerAlarms(registry, context) {
  registry.register("my-module-alarm", async () => {
    await context.ytm.executePlaybackAction("pause");
  });
}
```

## Module Notification Click Registry

`registerNotificationClicks()` receives a `NotificationClickHandlerRegistry`.

```typescript
export interface NotificationClickHandlerRegistry {
  register(id: string, handler: NotificationClickHandler): void;
}
```

Use `registerNotificationClicks()` for behavior that should run when a browser
notification is clicked.

```typescript
registerNotificationClicks(registry, context) {
  registry.register("now-playing", async () => {
    await context.ytm.focusTab();
  });
}
```

## Popup Views

Popup views are still template-driven. Keep module-specific markup in
`popup.html` and wire behavior in `popup.ts`.

```typescript
export function createExamplePopupView(context?: ModuleContext): PopupView {
  return {
    id: "example-settings",
    label: "Example",
    render(container) {
      renderPopupTemplate(container, templateHtml);
      if (!context) return;

      bindModuleToggle(container, "example-toggle", {
        get: () =>
          context.runtime.request<boolean>({
            type: "get-example-enabled",
          }),
        set: (enabled) =>
          context.runtime.command({
            type: "set-example-enabled",
            enabled,
          }),
      });
    },
  };
}
```

The optional context argument keeps direct unit tests simple, but the actual
popup path passes a real popup context from `getAllPopupViews()`.

## Module UI Helpers

Use `src/popup/module-ui.ts` for module-facing popup controls.

- `bindModuleToggle()` for checkbox get/set controls.
- `bindModuleSelect()` for select get/set controls.
- `bindModuleRange()` for range slider get/set controls.
- `bindModuleCheckboxGroup()` for grouped boolean fields.
- `bindModuleActionButton()` for async buttons.
- `createStatusMessage()` for simple status text.
- `createActionRow()` for a labeled async action row.

Prefer function-based bindings with clients or context capabilities:

```typescript
bindModuleToggle(container, "mini-player-toggle", {
  get: () =>
    context.runtime.request<boolean>({
      type: "get-mini-player-enabled",
    }),
  set: (enabled) =>
    context.runtime.command({
      type: "set-mini-player-enabled",
      enabled,
    }),
});
```

Message-type bindings are supported for compatibility with older tests and
fallback paths, but new module code should use function bindings.

Use standalone UI components from `src/ui/` when a control has module-specific
coordination. For example, Audio Visualizer tuning controls use
`createRangeSlider()` directly because style-specific tuning state is coupled.

## Ownership Guidelines

Module-owned code should live with the module:

- popup view factories and popup behavior;
- module-specific background handlers;
- module-specific in-memory state;
- module-specific timer or listener lifecycle;
- module-specific content broadcast payloads.

Background should keep only global responsibilities:

- constructing shared context and clients;
- restoring persisted state;
- registering global browser listeners;
- forwarding global events to modules;
- YTM tab lifecycle and selected-tab policy;
- dev/prod coexistence policy;
- bridge injection and content runtime suspension.

## Adding A Module

1. Create `src/modules/<module-name>/`.
2. Implement `FeatureModule`.
3. Register the module in `src/background/index.ts`.
4. Add `getPopupViews(context)` when the module needs popup UI.
5. Add `registerHandlers(registry, context)` for module-owned messages.
6. Add `registerHotkeys(registry, context)` for module-owned browser commands.
7. Add `registerAlarms(registry, context)` for module-owned browser alarms.
8. Add `registerNotificationClicks(registry, context)` for module-owned browser
   notification click handlers.
9. Persist module state through `context.state.saveValue()`.
10. Use `context.ytm` for YTM tab and playback behavior.
11. Use `context.runtime` and `module-ui` helpers in popup views.
12. Add focused tests for lifecycle, handlers, popup wiring, and broadcasts.

## Testing

Useful targets:

```sh
pnpm run test -- tests/core/extension.test.ts
pnpm run test -- tests/core/popup-context.test.ts
pnpm run test -- tests/popup/module-ui.test.ts
pnpm run test -- tests/modules/<module-name>/
```

For any feature cycle, finish with:

```sh
pnpm run format
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run dev:build
```
