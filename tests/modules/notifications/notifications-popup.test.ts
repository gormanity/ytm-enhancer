import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNotificationsPopupView } from "@/modules/notifications/popup";

describe("notifications popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createNotificationsPopupView();

    expect(view.id).toBe("notifications-settings");
    expect(view.label).toBe("Notifications");
  });

  it("should render a heading", () => {
    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Track Notifications");
  });

  it("should render a toggle switch checked when enabled", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: true });
        }
      },
    );

    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggle = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggle).not.toBeNull();
      expect(toggle?.checked).toBe(true);
      expect(toggle?.disabled).toBe(false);
    });
  });

  it("should query current enabled state on render", () => {
    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-notifications-enabled" },
      expect.any(Function),
    );
  });

  it("should render unpause toggle", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: false });
        }
      },
    );

    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    const labels = container.querySelectorAll("label.toggle-row");
    expect(labels).toHaveLength(2);
    expect(labels[1].querySelector("span")?.textContent).toBe(
      "Show notification when resuming playback",
    );
  });

  it("should query unpause state on render", () => {
    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-notify-on-unpause" },
      expect.any(Function),
    );
  });

  it("should send set-notify-on-unpause on toggle", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: false });
        }
      },
    );

    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggles = container.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggles[1]?.disabled).toBe(false);
    });

    const unpauseToggle = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )[1]!;
    unpauseToggle.checked = true;
    unpauseToggle.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-notify-on-unpause",
      enabled: true,
    });
  });

  it("should send set-notifications-enabled message on toggle", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: true });
        }
      },
    );

    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const toggle = container.querySelector<HTMLInputElement>(
        'input[type="checkbox"]',
      );
      expect(toggle?.disabled).toBe(false);
    });

    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    )!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-notifications-enabled",
      enabled: false,
    });
  });
});
