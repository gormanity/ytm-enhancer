import { describe, it, expect, vi, beforeEach } from "vitest";
import { detectCapabilities } from "@/core/capabilities";

describe("detectCapabilities", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", undefined);
    vi.stubGlobal("browser", undefined);
    vi.stubGlobal("documentPictureInPicture", undefined);
  });

  it("should detect Chrome notifications support", () => {
    vi.stubGlobal("chrome", {
      notifications: { create: vi.fn() },
      commands: undefined,
      runtime: { id: "test" },
    });

    const caps = detectCapabilities();
    expect(caps.notifications).toBe(true);
    expect(caps.commands).toBe(false);
  });

  it("should detect Chrome commands support", () => {
    vi.stubGlobal("chrome", {
      notifications: undefined,
      commands: { getAll: vi.fn() },
      runtime: { id: "test" },
    });

    const caps = detectCapabilities();
    expect(caps.commands).toBe(true);
    expect(caps.notifications).toBe(false);
  });

  it("should detect the runtime environment", () => {
    vi.stubGlobal("chrome", {
      runtime: { id: "test" },
    });

    const caps = detectCapabilities();
    expect(caps.runtime).toBe("chrome");
  });

  it("should detect Firefox runtime via browser global", () => {
    vi.stubGlobal("browser", {
      runtime: { id: "test", getBrowserInfo: vi.fn() },
    });
    vi.stubGlobal("chrome", {
      runtime: { id: "test" },
    });

    const caps = detectCapabilities();
    expect(caps.runtime).toBe("firefox");
  });

  it("should return safe defaults when no APIs are available", () => {
    const caps = detectCapabilities();
    expect(caps.notifications).toBe(false);
    expect(caps.commands).toBe(false);
    expect(caps.runtime).toBe("unknown");
  });

  it("should detect storage support", () => {
    vi.stubGlobal("chrome", {
      storage: { local: {}, sync: {} },
      runtime: { id: "test" },
    });

    const caps = detectCapabilities();
    expect(caps.storageLocal).toBe(true);
    expect(caps.storageSync).toBe(true);
  });

  it("should detect Document Picture-in-Picture support", () => {
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn() });

    const caps = detectCapabilities();
    expect(caps.documentPip).toBe(true);
  });

  it("should report no Document PiP when API is absent", () => {
    const caps = detectCapabilities();
    expect(caps.documentPip).toBe(false);
  });
});
