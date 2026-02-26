export { ModuleRegistry } from "./registry";
export { EventBus } from "./events";
export { VersionedStorage } from "./storage";
export type { StorageArea, VersionedStorageOptions } from "./storage";
export { detectCapabilities } from "./capabilities";
export { createMessageSender, createMessageHandler } from "./messaging";
export type { Message, MessageResponse, SendOptions } from "./messaging";
export type { Capabilities, BrowserRuntime } from "./capabilities";
export type {
  FeatureModule,
  PlaybackState,
  PlaybackAction,
  PopupView,
} from "./types";
