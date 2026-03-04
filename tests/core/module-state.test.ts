import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadModuleState, saveModuleStateValue } from "@/core/module-state";

function createMockChromeStorage() {
  const store: Record<string, unknown> = {};
  return {
    local: {
      get: vi.fn((keys: string | string[]) => {
        const keyList = typeof keys === "string" ? [keys] : keys;
        return Promise.resolve(
          Object.fromEntries(
            keyList.filter((k) => k in store).map((k) => [k, store[k]]),
          ),
        );
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      }),
    },
    _store: store,
  };
}

describe("module-state", () => {
  let mockStorage: ReturnType<typeof createMockChromeStorage>;

  beforeEach(() => {
    mockStorage = createMockChromeStorage();
    globalThis.chrome = { storage: mockStorage } as unknown as typeof chrome;
  });

  describe("loadModuleState", () => {
    it("returns an empty object when nothing is stored", async () => {
      const state = await loadModuleState();
      expect(state).toEqual({});
    });

    it("returns the stored state map", async () => {
      mockStorage._store.moduleState = {
        "notifications.enabled": true,
        "auto-skip-disliked.enabled": false,
      };

      const state = await loadModuleState();
      expect(state).toEqual({
        "notifications.enabled": true,
        "auto-skip-disliked.enabled": false,
      });
    });
  });

  describe("saveModuleStateValue", () => {
    it("saves a new key into an empty store", async () => {
      await saveModuleStateValue("notifications.enabled", true);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        moduleState: { "notifications.enabled": true },
      });
    });

    it("merges with existing stored values", async () => {
      mockStorage._store.moduleState = {
        "notifications.enabled": true,
      };

      await saveModuleStateValue("auto-skip-disliked.enabled", false);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        moduleState: {
          "notifications.enabled": true,
          "auto-skip-disliked.enabled": false,
        },
      });
    });

    it("overwrites an existing key", async () => {
      mockStorage._store.moduleState = {
        "notifications.enabled": true,
      };

      await saveModuleStateValue("notifications.enabled", false);

      expect(mockStorage.local.set).toHaveBeenCalledWith({
        moduleState: { "notifications.enabled": false },
      });
    });

    it("serializes concurrent writes so values are not lost", async () => {
      await Promise.all([
        saveModuleStateValue("auto-play.enabled", false),
        saveModuleStateValue("notifications.enabled", true),
      ]);

      expect(mockStorage._store.moduleState).toEqual({
        "auto-play.enabled": false,
        "notifications.enabled": true,
      });
    });
  });
});
