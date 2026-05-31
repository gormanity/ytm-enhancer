# Hotkey Registration

Keyboard shortcuts are managed by `HotkeyRegistry` (`src/core/hotkey-registry`)
and dispatched from `chrome.commands.onCommand` in the background script.

## Architecture

`HotkeyRegistry` is a central registry where modules register command handlers
through `FeatureModule.registerHotkeys()`. The background script's
`chrome.commands.onCommand` listener calls `hotkeyRegistry.dispatch(command)`,
which routes to the registered handler.

The background script owns only the browser listener and dispatch call. Feature
modules own the command behavior. `HotkeysModule` owns the popup view that shows
configured shortcuts from `chrome.commands.getAll()`.

## Adding a New Hotkey

### 1. Declare the Command in Manifests

Add an entry under `"commands"` in each browser manifest:

- `src/manifests/chrome.json`
- `src/manifests/edge.json`
- `src/manifests/firefox.json`

```json
{
  "commands": {
    "my-command": {
      "suggested_key": {
        "default": "Alt+Shift+M"
      },
      "description": "Do something useful"
    }
  }
}
```

Chrome limits extensions to four keyboard shortcuts by default. Users can assign
additional shortcuts manually via `chrome://extensions/shortcuts`.

### 2. Register a Handler in the Owning Module

In the module that owns the behavior, implement `registerHotkeys()` and call
`registry.register()` with the command name matching the manifest key:

```typescript
registerHotkeys(registry, context) {
  const playback = createPlaybackController(
    createYtmPlaybackDriver(context.ytm),
  );

  registry.register("my-command", async () => {
    await playback.executeAction("togglePlay");
  });
}
```

Handlers receive the command string as their argument and can be synchronous or
async.

### 3. Verify

- Run `pnpm run check` — all tests pass.
- Build both targets: `pnpm run build:chrome` and `pnpm run build:firefox`.
- Load the extension and verify the shortcut works.
- The hotkeys popup should display the new shortcut automatically (it reads from
  `chrome.commands.getAll()`).

## API Reference

### `HotkeyRegistry`

```typescript
import { HotkeyRegistry } from "@/core/hotkey-registry";

const registry = new HotkeyRegistry();
```

#### `register(command, handler)`

Register a handler for a command string. Throws if the command is already
registered.

```typescript
registry.register("play-pause", async (command) => {
  // handle the command
});
```

#### `dispatch(command)`

Route a command to its registered handler. No-op if no handler is registered for
the command.

```typescript
await registry.dispatch("play-pause");
```

#### `has(command)`

Returns `true` if a handler is registered for the command.

```typescript
registry.has("play-pause"); // true
```

### `CommandHandler`

```typescript
type CommandHandler = (command: string) => void | Promise<void>;
```

## Existing Commands

| Command          | Action                                   |
| ---------------- | ---------------------------------------- |
| `play-pause`     | Toggle playback                          |
| `next-track`     | Skip to next track                       |
| `previous-track` | Go to previous track                     |
| `focus-ytm-tab`  | Focus the YouTube Music tab              |
| `remind-me`      | Show notification with the current track |

Handlers are registered by the modules that own the behavior.
