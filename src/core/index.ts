export { ModuleRegistry } from "./registry";
export { EventBus } from "./events";
export { VersionedStorage } from "./storage";
export type { StorageArea, VersionedStorageOptions } from "./storage";
export { detectCapabilities } from "./capabilities";
export { createShortcutCommandClient } from "./commands";
export { createMessageSender, createMessageHandler } from "./messaging";
export { createRuntimeClient } from "./messaging";
export { ActionExecutor } from "./actions";
export { HotkeyRegistry } from "./hotkey-registry";
export type { CommandHandler } from "./hotkey-registry";
export { PopupRegistry } from "./popup-registry";
export {
  createExtensionContext,
  initializeModules,
  registerModuleHandlers,
} from "./extension";
export {
  createPopupModuleContext,
  createPopupYtmRuntimeClient,
} from "./popup-context";
export { findYTMTab } from "./tab-finder";
export { relayToYTMTab } from "./relay";
export { createYtmRuntimeClient } from "./ytm-client";
export type { ExtensionContext } from "./extension";
export type { ShortcutCommand, ShortcutCommandClient } from "./commands";
export type {
  Message,
  MessageResponse,
  ModuleHandlerRegistry,
  RuntimeClient,
  SendOptions,
} from "./messaging";
export type { Capabilities, BrowserRuntime } from "./capabilities";
export type {
  YtmRuntimeClient,
  YtmRuntimeClientOptions,
  YtmTabListState,
  YtmTabSummary,
  YtmTarget,
} from "./ytm-client";
export type {
  FeatureModule,
  AutoPlayMode,
  PlaybackState,
  PlaybackAction,
  ModuleContext,
  PopupView,
} from "./types";
