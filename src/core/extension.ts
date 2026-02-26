import { ModuleRegistry } from "./registry";
import { EventBus } from "./events";
import { PopupRegistry } from "./popup-registry";
import { detectCapabilities } from "./capabilities";
import type { Capabilities } from "./capabilities";
import type { FeatureModule } from "./types";

/** Central extension context shared across all modules. */
export interface ExtensionContext {
  modules: ModuleRegistry;
  events: EventBus;
  popup: PopupRegistry;
  capabilities: Capabilities;
}

/** Create and initialize the extension context. */
export function createExtensionContext(): ExtensionContext {
  return {
    modules: new ModuleRegistry(),
    events: new EventBus(),
    popup: new PopupRegistry(),
    capabilities: detectCapabilities(),
  };
}

/** Register and initialize a set of feature modules. */
export async function initializeModules(
  context: ExtensionContext,
  modules: FeatureModule[],
): Promise<void> {
  for (const module of modules) {
    context.modules.register(module);

    const views = module.getPopupViews?.() ?? [];
    for (const view of views) {
      context.popup.register(view);
    }

    if (module.isEnabled()) {
      await module.init();
    }
  }
}
