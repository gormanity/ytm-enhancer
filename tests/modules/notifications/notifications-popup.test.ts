import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNotificationsPopupView } from "@/modules/notifications/popup";

describe("notifications popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();

    vi.stubGlobal("chrome", {
      commands: {},
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
    expect(heading?.textContent).toBe("Notifications");
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

    const labels = container.querySelectorAll("label.card-row");
    expect(labels).toHaveLength(2);
    expect(labels[1].querySelector("span")?.textContent).toBe(
      "Show on resume playback",
    );
  });

  it("should hide Firefox notification chime limitations on Chrome", () => {
    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    const hint = container.querySelector<HTMLElement>(
      '[data-role="notifications-firefox-tip"]',
    );
    expect(hint?.classList.contains("is-hidden")).toBe(true);
  });

  it("should show Firefox notification chime limitations on Firefox", () => {
    vi.stubGlobal("chrome", {
      commands: {
        update: vi.fn(),
      },
      runtime: {
        sendMessage: sendMessageMock,
      },
    });

    const view = createNotificationsPopupView();
    const container = document.createElement("div");

    view.render(container);

    const hint = container.querySelector<HTMLElement>(
      '[data-role="notifications-firefox-tip"]',
    );
    const text = hint?.textContent?.replace(/\s+/g, " ").trim();
    expect(hint?.classList.contains("is-hidden")).toBe(false);
    expect(text).toContain(
      "Firefox does not support silent extension notifications",
    );
    expect(text).toContain(
      "disable notification sounds for Firefox at the operating system level",
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

  describe("display field checkboxes", () => {
    const defaultFields = {
      title: true,
      artist: true,
      album: false,
      year: false,
      artwork: true,
    };

    function setupWithFields(fields = defaultFields) {
      sendMessageMock.mockImplementation(
        (message: { type: string }, callback?: (response: unknown) => void) => {
          if (callback) {
            if (message.type === "get-notification-fields") {
              callback({ ok: true, data: fields });
            } else {
              callback({ ok: true, data: true });
            }
          }
        },
      );
    }

    it("should render display field checkboxes", async () => {
      setupWithFields();

      const view = createNotificationsPopupView();
      const container = document.createElement("div");
      view.render(container);

      await vi.waitFor(() => {
        const fieldCheckboxes =
          container.querySelectorAll<HTMLInputElement>(".field-row input");
        expect(fieldCheckboxes).toHaveLength(5);
      });
    });

    it("should query notification fields on render", () => {
      setupWithFields();

      const view = createNotificationsPopupView();
      const container = document.createElement("div");
      view.render(container);

      expect(sendMessageMock).toHaveBeenCalledWith(
        { type: "get-notification-fields" },
        expect.any(Function),
      );
    });

    it("should reflect loaded field state in checkboxes", async () => {
      setupWithFields({
        title: true,
        artist: false,
        album: true,
        year: false,
        artwork: true,
      });

      const view = createNotificationsPopupView();
      const container = document.createElement("div");
      view.render(container);

      await vi.waitFor(() => {
        const fieldCheckboxes =
          container.querySelectorAll<HTMLInputElement>(".field-row input");
        expect(fieldCheckboxes[0]?.disabled).toBe(false);
      });

      const checkboxes =
        container.querySelectorAll<HTMLInputElement>(".field-row input");
      expect(checkboxes[0]?.checked).toBe(true); // title
      expect(checkboxes[1]?.checked).toBe(false); // artist
      expect(checkboxes[2]?.checked).toBe(true); // album
      expect(checkboxes[3]?.checked).toBe(false); // year
      expect(checkboxes[4]?.checked).toBe(true); // artwork
    });

    it("should send set-notification-fields when a checkbox changes", async () => {
      setupWithFields();

      const view = createNotificationsPopupView();
      const container = document.createElement("div");
      view.render(container);

      await vi.waitFor(() => {
        const fieldCheckboxes =
          container.querySelectorAll<HTMLInputElement>(".field-row input");
        expect(fieldCheckboxes[0]?.disabled).toBe(false);
      });

      const checkboxes =
        container.querySelectorAll<HTMLInputElement>(".field-row input");
      // Toggle album on
      checkboxes[2].checked = true;
      checkboxes[2].dispatchEvent(new Event("change"));

      expect(sendMessageMock).toHaveBeenCalledWith({
        type: "set-notification-fields",
        fields: {
          title: true,
          artist: true,
          album: true,
          year: false,
          artwork: true,
        },
      });
    });

    it("should render field labels", async () => {
      setupWithFields();

      const view = createNotificationsPopupView();
      const container = document.createElement("div");
      view.render(container);

      await vi.waitFor(() => {
        const rows = container.querySelectorAll(".field-row");
        expect(rows).toHaveLength(5);
      });

      const labels = container.querySelectorAll(".field-row span");
      expect(labels[0]?.textContent).toBe("Title");
      expect(labels[1]?.textContent).toBe("Artist");
      expect(labels[2]?.textContent).toBe("Album");
      expect(labels[3]?.textContent).toBe("Year");
      expect(labels[4]?.textContent).toBe("Artwork");
    });
  });
});
