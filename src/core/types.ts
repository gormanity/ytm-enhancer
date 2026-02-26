/** Playback state snapshot produced by the adapter layer. */
export interface PlaybackState {
  title: string | null;
  artist: string | null;
  album: string | null;
  artworkUrl: string | null;
  isPlaying: boolean;
  progress: number;
  duration: number;
}

/** Actions that can be executed on the YouTube Music player. */
export type PlaybackAction =
  | "play"
  | "pause"
  | "next"
  | "previous"
  | "togglePlay";

/** A popup view registered by a feature module. */
export interface PopupView {
  id: string;
  label: string;
  render: (container: HTMLElement) => void;
}

/** Interface that all feature modules must implement. */
export interface FeatureModule {
  id: string;
  name: string;
  description: string;

  /** Called when the module is initialized. */
  init(): void | Promise<void>;

  /** Called when the module is destroyed. */
  destroy(): void;

  /** Whether this module is currently enabled. */
  isEnabled(): boolean;

  /** Enable or disable this module. */
  setEnabled(enabled: boolean): void;

  /** Optional popup views this module provides. */
  getPopupViews?(): PopupView[];
}
