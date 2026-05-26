export type ShortcutCommand = chrome.commands.Command;

export interface ShortcutCommandClient {
  canEdit(): boolean;
  getAll(): Promise<ShortcutCommand[]>;
  update(name: string, shortcut: string): Promise<void>;
  reset(name: string): Promise<void>;
  openShortcutsPage(): Promise<void>;
}

function getChromeApi(): typeof chrome | null {
  return typeof chrome === "undefined" ? null : chrome;
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
