import { FeatureModule } from "./types";

/** Central registry for feature modules. */
export class ModuleRegistry {
  private modules = new Map<string, FeatureModule>();

  register(module: FeatureModule): void {
    if (this.modules.has(module.id)) {
      throw new Error(`Module already registered: ${module.id}`);
    }
    this.modules.set(module.id, module);
  }

  unregister(id: string): void {
    this.modules.delete(id);
  }

  get(id: string): FeatureModule | undefined {
    return this.modules.get(id);
  }

  getAll(): FeatureModule[] {
    return Array.from(this.modules.values());
  }

  has(id: string): boolean {
    return this.modules.has(id);
  }
}
