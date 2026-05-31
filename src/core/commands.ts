import type { MessageResponse } from "./messaging";
import type { RegisteredHotkeyCommand } from "./hotkey-registry";

export type ShortcutCommand = chrome.commands.Command;

export interface ShortcutCommandClient {
  canEdit(): boolean;
  getAll(): Promise<ShortcutCommand[]>;
  getRegisteredCommands(): Promise<RegisteredHotkeyCommand[]>;
  update(name: string, shortcut: string): Promise<void>;
  reset(name: string): Promise<void>;
  openShortcutsPage(): Promise<void>;
}

function getChromeApi(): typeof chrome | null {
  return typeof chrome === "undefined" ? null : chrome;
}

function sendRuntimeMessage(message: {
  type: string;
}): Promise<MessageResponse | null> {
  const api = getChromeApi();
  if (typeof api?.runtime?.sendMessage !== "function") {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (response?: MessageResponse): void => {
      if (settled) return;
      settled = true;
      resolve(response ?? null);
    };

    try {
      const result = api.runtime.sendMessage(message, settle) as
        | Promise<MessageResponse | undefined>
        | undefined;
      if (result && typeof result.then === "function") {
        result.then(settle).catch(() => resolve(null));
      }
    } catch {
      resolve(null);
    }
  });
}

export function createShortcutCommandClient(): ShortcutCommandClient {
  return {
    canEdit() {
      const api = getChromeApi();
      return typeof api?.commands?.update === "function";
    },

    getAll() {
      const api = getChromeApi();
      if (!api?.commands?.getAll) return Promise.resolve([]);

      return new Promise((resolve) => {
        api.commands.getAll((commands) => resolve(commands));
      });
    },

    async getRegisteredCommands() {
      const response = await sendRuntimeMessage({
        type: "get-registered-hotkeys",
      });
      if (!response?.ok || !Array.isArray(response.data)) return [];
      return response.data as RegisteredHotkeyCommand[];
    },

    async update(name, shortcut) {
      const api = getChromeApi();
      await Promise.resolve(api?.commands?.update?.({ name, shortcut }));
    },

    async reset(name) {
      const api = getChromeApi();
      await Promise.resolve(api?.commands?.reset?.(name));
    },

    async openShortcutsPage() {
      const api = getChromeApi();
      await Promise.resolve(
        api?.tabs?.create?.({ url: "chrome://extensions/shortcuts" }),
      );
    },
  };
}
