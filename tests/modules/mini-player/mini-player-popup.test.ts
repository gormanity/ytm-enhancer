import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMiniPlayerPopupView } from "@/modules/mini-player/popup";

describe("mini player popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    vi.stubGlobal("documentPictureInPicture", { requestWindow: vi.fn() });

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createMiniPlayerPopupView();

    expect(view.id).toBe("mini-player-settings");
    expect(view.label).toBe("Mini Player");
  });

  it("should render a heading", () => {
    const view = createMiniPlayerPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Mini Player");
  });

  it("should render a toggle switch checked when enabled", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if ((message as { type?: string }).type === "get-mini-player-enabled") {
          callback?.({ ok: true, data: true });
          return;
        }
        if (
          (message as { type?: string }).type ===
          "get-mini-player-suppress-notifications"
        ) {
          callback?.({ ok: true, data: false });
        }
      },
    );

    const view = createMiniPlayerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggles = container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggles).toHaveLength(2);
      expect(toggles[0]?.checked).toBe(true);
      expect(toggles[0]?.disabled).toBe(false);
      expect(toggles[1]?.checked).toBe(false);
      expect(toggles[1]?.disabled).toBe(false);
    });
  });

  it("should query current states on render", () => {
    const view = createMiniPlayerPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-mini-player-enabled" },
      expect.any(Function),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-mini-player-suppress-notifications" },
      expect.any(Function),
    );
  });

  it("should disable controls and show a tip when Document PiP is unavailable", () => {
    vi.stubGlobal("documentPictureInPicture", undefined);

    const view = createMiniPlayerPopupView();
    const container = document.createElement("div");

    view.render(container);

    const toggles = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(toggles).toHaveLength(2);
    expect(toggles[0]?.checked).toBe(false);
    expect(toggles[0]?.disabled).toBe(true);
    expect(toggles[1]?.checked).toBe(false);
    expect(toggles[1]?.disabled).toBe(true);

    const tip = container.querySelector<HTMLElement>(
      '[data-role="mini-player-document-pip-tip"]',
    );
    expect(tip?.classList.contains("is-hidden")).toBe(false);
    expect(tip?.textContent).toContain(
      "Mini Player requires Document Picture-in-Picture support",
    );
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should send set-mini-player-enabled message on toggle", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if ((message as { type?: string }).type === "get-mini-player-enabled") {
          callback?.({ ok: true, data: true });
          return;
        }
        if (
          (message as { type?: string }).type ===
          "get-mini-player-suppress-notifications"
        ) {
          callback?.({ ok: true, data: false });
        }
      },
    );

    const view = createMiniPlayerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggles = container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggles[0]?.disabled).toBe(false);
    });

    const toggles = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    toggles[0]!.checked = false;
    toggles[0]!.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-mini-player-enabled",
      enabled: false,
    });
  });

  it("should send set-mini-player-suppress-notifications message on toggle", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          if (
            (message as { type?: string }).type ===
            "get-mini-player-suppress-notifications"
          ) {
            callback({ ok: true, data: false });
          } else {
            callback({ ok: true, data: true });
          }
        }
      },
    );

    const view = createMiniPlayerPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggles = container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggles[1]?.disabled).toBe(false);
    });

    const toggles = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    toggles[1]!.checked = true;
    toggles[1]!.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-mini-player-suppress-notifications",
      enabled: true,
    });
  });
});
