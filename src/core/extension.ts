import { ModuleRegistry } from "./registry";
import { EventBus } from "./events";
import { PopupRegistry } from "./popup-registry";
import { detectCapabilities } from "./capabilities";
import type { Capabilities } from "./capabilities";
import type { FeatureModule, ModuleContext } from "./types";
import type { YtmRuntimeClient } from "./ytm-client";

/** Central extension context shared across all modules. */
export interface ExtensionContext extends ModuleContext {
  modules: ModuleRegistry;
  events: EventBus;
  popup: PopupRegistry;
  capabilities: Capabilities;
}

export interface ExtensionContextOptions {
  ytm: YtmRuntimeClient;
}

/** Create and initialize the extension context. */
export function createExtensionContext(
  options: ExtensionContextOptions,
): ExtensionContext {
  return {
    modules: new ModuleRegistry(),
    events: new EventBus(),
    popup: new PopupRegistry(),
    capabilities: detectCapabilities(),
    ytm: options.ytm,
  };
}

/** Register and initialize a set of feature modules. */
export async function initializeModules(
  context: ExtensionContext,
  modules: FeatureModule[],
): Promise<void> {
  for (const module of modules) {
    context.modules.register(module);

    const views = module.getPopupViews?.(context) ?? [];
    for (const view of views) {
      context.popup.register(view);
    }

    if (module.isEnabled()) {
      await module.init(context);
    }
  }
}
