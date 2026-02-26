import { describe, it, expect, vi, beforeEach } from "vitest";
import { VersionedStorage } from "@/core/storage";

function createMockChromeStorage() {
  const store: Record<string, unknown> = {};
  return {
    local: {
      get: vi.fn((keys: string[]) =>
        Promise.resolve(
          Object.fromEntries(
            keys.filter((k) => k in store).map((k) => [k, store[k]]),
          ),
        ),
      ),
      set: vi.fn((items: Record<string, unknown>) => {
        Object.assign(store, items);
        return Promise.resolve();
      }),
      remove: vi.fn((keys: string[]) => {
        for (const k of keys) delete store[k];
        return Promise.resolve();
      }),
    },
    _store: store,
  };
}

describe("VersionedStorage", () => {
  let mockStorage: ReturnType<typeof createMockChromeStorage>;
  let storage: VersionedStorage<{ volume: number; muted: boolean }>;

  beforeEach(() => {
    mockStorage = createMockChromeStorage();
    storage = new VersionedStorage({
      key: "settings",
      version: 1,
      defaults: { volume: 50, muted: false },
      storageArea: mockStorage.local,
    });
  });

  it("should return defaults when storage is empty", async () => {
    const data = await storage.get();
    expect(data).toEqual({ volume: 50, muted: false });
  });

  it("should persist and retrieve data", async () => {
    await storage.set({ volume: 75 });
    const data = await storage.get();
    expect(data).toEqual({ volume: 75, muted: false });
  });

  it("should overwrite only specified keys", async () => {
    await storage.set({ volume: 80 });
    await storage.set({ muted: true });
    const data = await storage.get();
    expect(data).toEqual({ volume: 80, muted: true });
  });

  it("should store the version alongside data", async () => {
    await storage.set({ volume: 60 });
    expect(mockStorage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({ __version: 1 }),
      }),
    );
  });

  it("should run migration when stored version is older", async () => {
    mockStorage._store["settings"] = {
      __version: 1,
      volume: 30,
      muted: false,
    };

    const migrated = new VersionedStorage({
      key: "settings",
      version: 2,
      defaults: { volume: 50, muted: false },
      storageArea: mockStorage.local,
      migrations: {
        2: (old: Record<string, unknown>) => ({
          ...old,
          volume: Math.min((old.volume as number) * 2, 100),
        }),
      },
    });

    const data = await migrated.get();
    expect(data).toEqual({ volume: 60, muted: false });
  });

  it("should run migrations sequentially across versions", async () => {
    mockStorage._store["settings"] = {
      __version: 1,
      volume: 20,
      muted: false,
    };

    const migrated = new VersionedStorage({
      key: "settings",
      version: 3,
      defaults: { volume: 50, muted: false },
      storageArea: mockStorage.local,
      migrations: {
        2: (old: Record<string, unknown>) => ({
          ...old,
          volume: (old.volume as number) + 10,
        }),
        3: (old: Record<string, unknown>) => ({
          ...old,
          volume: (old.volume as number) + 5,
        }),
      },
    });

    const data = await migrated.get();
    expect(data).toEqual({ volume: 35, muted: false });
  });

  it("should reset storage to defaults", async () => {
    await storage.set({ volume: 99, muted: true });
    await storage.reset();
    const data = await storage.get();
    expect(data).toEqual({ volume: 50, muted: false });
  });
});
