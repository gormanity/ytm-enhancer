import { describe, expect, it } from "vitest";
import {
  isNativeHostBusyError,
  isNativeHostConnectorEnabled,
  isNativeHostExitError,
} from "@/core/connectors/native-host-policy";

describe("native host policy", () => {
  it.each([
    "YTM Menu Bar is already connected to Chrome.",
    "YTM Menu Bar is already connected to Firefox.",
    "YTM Tray is already connected to Microsoft Edge.",
    "The app is already connected to another browser.",
  ])("classifies browser ownership diagnostics: %s", (message) => {
    expect(isNativeHostBusyError(message)).toBe(true);
  });

  it("does not classify ordinary disconnects as browser ownership", () => {
    expect(isNativeHostBusyError("Native host exited.")).toBe(false);
    expect(isNativeHostExitError("Native host exited.")).toBe(true);
  });

  it("keeps persisted connector disables out of native host startup", () => {
    const connectors = new Map([
      ["enabled", { enabled: true }],
      ["disabled", { enabled: false }],
    ]);

    expect(isNativeHostConnectorEnabled(connectors, "enabled")).toBe(true);
    expect(isNativeHostConnectorEnabled(connectors, "disabled")).toBe(false);
    expect(isNativeHostConnectorEnabled(connectors, "unseen")).toBe(true);
  });
});
