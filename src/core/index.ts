export { ModuleRegistry } from "./registry";
export { EventBus } from "./events";
export { VersionedStorage } from "./storage";
export type { StorageArea, VersionedStorageOptions } from "./storage";
export { detectCapabilities } from "./capabilities";
export { createShortcutCommandClient } from "./commands";
export { createMessageSender, createMessageHandler } from "./messaging";
export { createRuntimeClient } from "./messaging";
export { ActionExecutor } from "./actions";
export { AlarmRegistry, createAlarmSchedulerClient } from "./alarm-registry";
export { createDocumentPipClient } from "./document-pip";
export {
  NotificationClickRegistry,
  createNotificationClient,
} from "./notifications";
export { HotkeyRegistry } from "./hotkey-registry";
export type {
  AlarmEvent,
  AlarmHandler,
  AlarmHandlerRegistry,
  AlarmInfo,
  AlarmSchedulerClient,
} from "./alarm-registry";
export type {
  NotificationClickHandler,
  NotificationClickHandlerRegistry,
  NotificationClient,
  NotificationOptions,
} from "./notifications";
export type { CommandHandler, HotkeyHandlerRegistry } from "./hotkey-registry";
export { PopupRegistry } from "./popup-registry";
export {
  createExtensionContext,
  initializeModules,
  registerModuleAlarms,
  registerModuleHandlers,
  registerModuleHotkeys,
  registerModuleNotificationClicks,
  syncModuleContentState,
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
  DocumentPipClient,
  DocumentPipWindowRequest,
} from "./document-pip";
export type {
  YtmRuntimeClient,
  YtmRuntimeClientOptions,
  YtmTabListState,
  YtmTabSummary,
  YtmTarget,
} from "./ytm-client";
export type {
  FeatureModule,
  ExtensionMetadataClient,
  AutoPlayMode,
  PlaybackState,
  PlaybackAction,
  ModuleContext,
  PopupView,
} from "./types";
