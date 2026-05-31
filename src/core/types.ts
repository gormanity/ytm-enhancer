import type { Capabilities } from "./capabilities";
import type { ShortcutCommandClient } from "./commands";
import type { EventBus } from "./events";
import type { HotkeyHandlerRegistry } from "./hotkey-registry";
import type { ModuleHandlerRegistry, RuntimeClient } from "./messaging";
import type { PopupRegistry } from "./popup-registry";
import type { YtmRuntimeClient } from "./ytm-client";

/** Playback state snapshot produced by the adapter layer. */
export interface PlaybackState {
  title: string | null;
  artist: string | null;
  album: string | null;
  year: number | null;
  artworkUrl: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
  isShuffling?: boolean;
  repeatMode?: "off" | "all" | "one";
}

/** Actions that can be executed on the YouTube Music player. */
export type PlaybackAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "togglePlay"
  | "shuffle"
  | "repeat";

export type AutoPlayMode = "default" | "off" | "on";

/** A popup view registered by a feature module. */
export interface PopupView {
  id: string;
  label: string;
  icon?: string;
  render: (container: HTMLElement) => void | (() => void);
}

/** Stable runtime capabilities provided to feature modules. */
export interface ModuleContext {
  events: EventBus;
  popup: PopupRegistry;
  capabilities: Capabilities;
  ytm: YtmRuntimeClient;
  runtime: RuntimeClient;
  state: {
    saveValue(key: string, value: unknown): Promise<void>;
  };
  storage: {
    get(keys: string[]): Promise<Record<string, unknown>>;
    set(items: Record<string, unknown>): Promise<void>;
  };
  commands: ShortcutCommandClient;
  popupEvents: {
    broadcast(message: { type: string; [key: string]: unknown }): void;
  };
}

/** Interface that all feature modules must implement. */
export interface FeatureModule {
  id: string;
  name: string;
  description: string;

  /** Called when the module is initialized. */
  init(context?: ModuleContext): void | Promise<void>;

  /** Called when the module is destroyed. */
  destroy(): void;

  /** Whether this module is currently enabled. */
  isEnabled(): boolean;

  /** Enable or disable this module. */
  setEnabled(enabled: boolean): void;

  /** Optional popup views this module provides. */
  getPopupViews?(context: ModuleContext): PopupView[];

  /** Optional background message handlers this module owns. */
  registerHandlers?(
    registry: ModuleHandlerRegistry,
    context: ModuleContext,
  ): void;

  /** Optional browser command hotkeys this module owns. */
  registerHotkeys?(
    registry: HotkeyHandlerRegistry,
    context: ModuleContext,
  ): void;
}
