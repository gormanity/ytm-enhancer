/** Minimal interface matching chrome.storage.local/sync. */
export interface StorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

type MigrationFn = (old: Record<string, unknown>) => Record<string, unknown>;

export interface VersionedStorageOptions<T extends Record<string, unknown>> {
  key: string;
  version: number;
  defaults: T;
  storageArea: StorageArea;
  migrations?: Record<number, MigrationFn>;
}

/** Storage wrapper with schema versioning and migration support. */
export class VersionedStorage<T extends Record<string, unknown>> {
  private key: string;
  private version: number;
  private defaults: T;
  private area: StorageArea;
  private migrations: Record<number, MigrationFn>;

  constructor(options: VersionedStorageOptions<T>) {
    this.key = options.key;
    this.version = options.version;
    this.defaults = options.defaults;
    this.area = options.storageArea;
    this.migrations = options.migrations ?? {};
  }

  async get(): Promise<T> {
    const result = await this.area.get([this.key]);
    const stored = result[this.key] as
      | (Record<string, unknown> & { __version?: number })
      | undefined;

    if (!stored) {
      return { ...this.defaults };
    }

    const storedVersion = stored.__version ?? 0;
    let data = { ...stored };

    if (storedVersion < this.version) {
      data = this.migrate(data, storedVersion);
      await this.write(data);
    }

    const { __version: _, ...rest } = data;
    return { ...this.defaults, ...rest } as T;
  }

  async set(partial: Partial<T>): Promise<void> {
    const current = await this.get();
    const merged = { ...current, ...partial };
    await this.write(merged);
  }

  async reset(): Promise<void> {
    await this.write({ ...this.defaults });
  }

  private async write(data: Record<string, unknown>): Promise<void> {
    await this.area.set({
      [this.key]: { ...data, __version: this.version },
    });
  }

  private migrate(
    data: Record<string, unknown>,
    fromVersion: number,
  ): Record<string, unknown> {
    let current = { ...data };
    for (let v = fromVersion + 1; v <= this.version; v++) {
      const fn = this.migrations[v];
      if (fn) {
        current = fn(current);
      }
    }
    return current;
  }
}
