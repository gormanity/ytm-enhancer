import { ModuleRegistry } from "./registry";
import { EventBus } from "./events";
import { PopupRegistry } from "./popup-registry";
import { detectCapabilities } from "./capabilities";
import { createShortcutCommandClient } from "./commands";
import type { Capabilities } from "./capabilities";
import type { FeatureModule, ModuleContext } from "./types";
import type { HotkeyHandlerRegistry } from "./hotkey-registry";
import type { YtmRuntimeClient } from "./ytm-client";
import {
  createRuntimeClient,
  type ModuleHandlerRegistry,
  type RuntimeClient,
} from "./messaging";

/** Central extension context shared across all modules. */
export interface ExtensionContext extends ModuleContext {
  modules: ModuleRegistry;
  events: EventBus;
  popup: PopupRegistry;
  capabilities: Capabilities;
}

export interface ExtensionContextOptions {
  ytm: YtmRuntimeClient;
  runtime?: RuntimeClient;
  state?: ModuleContext["state"];
  storage?: ModuleContext["storage"];
  commands?: ModuleContext["commands"];
  popupEvents?: ModuleContext["popupEvents"];
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
    runtime: options.runtime ?? createRuntimeClient(),
    state: options.state ?? { saveValue: async () => undefined },
    storage: options.storage ?? {
      get: async () => ({}),
      set: async () => undefined,
    },
    commands: options.commands ?? createShortcutCommandClient(),
    popupEvents: options.popupEvents ?? { broadcast: () => undefined },
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

/** Register message handlers owned by feature modules. */
export function registerModuleHandlers(
  context: ExtensionContext,
  modules: FeatureModule[],
  registry: ModuleHandlerRegistry,
): void {
  for (const module of modules) {
    module.registerHandlers?.(registry, context);
  }
}

/** Register browser command hotkeys owned by feature modules. */
export function registerModuleHotkeys(
  context: ExtensionContext,
  modules: FeatureModule[],
  registry: HotkeyHandlerRegistry,
): void {
  for (const module of modules) {
    module.registerHotkeys?.(registry, context);
  }
}
