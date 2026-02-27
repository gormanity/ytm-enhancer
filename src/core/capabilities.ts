export type BrowserRuntime = "chrome" | "firefox" | "unknown";

export interface Capabilities {
  runtime: BrowserRuntime;
  notifications: boolean;
  commands: boolean;
  storageLocal: boolean;
  storageSync: boolean;
  documentPip: boolean;
}

declare const browser: unknown;
declare const documentPictureInPicture: unknown;

function hasBrowserGlobal(): boolean {
  try {
    return (
      typeof browser !== "undefined" &&
      browser !== null &&
      typeof (browser as Record<string, unknown>).runtime === "object"
    );
  } catch {
    return false;
  }
}

function hasChromeGlobal(): boolean {
  try {
    return (
      typeof chrome !== "undefined" &&
      chrome !== null &&
      typeof chrome.runtime === "object" &&
      chrome.runtime !== null
    );
  } catch {
    return false;
  }
}

function detectRuntime(): BrowserRuntime {
  if (hasBrowserGlobal()) return "firefox";
  if (hasChromeGlobal()) return "chrome";
  return "unknown";
}

/** Detect available browser extension APIs. */
export function detectCapabilities(): Capabilities {
  const runtime = detectRuntime();

  return {
    runtime,
    notifications:
      hasChromeGlobal() && typeof chrome.notifications === "object",
    commands: hasChromeGlobal() && typeof chrome.commands === "object",
    storageLocal:
      hasChromeGlobal() &&
      typeof chrome.storage === "object" &&
      typeof chrome.storage.local === "object",
    storageSync:
      hasChromeGlobal() &&
      typeof chrome.storage === "object" &&
      typeof chrome.storage.sync === "object",
    documentPip: typeof documentPictureInPicture !== "undefined",
  };
}
