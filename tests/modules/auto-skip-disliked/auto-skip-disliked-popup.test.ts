import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAutoSkipDislikedPopupView } from "@/modules/auto-skip-disliked/popup";

describe("auto-skip-disliked popup view", () => {
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
    const view = createAutoSkipDislikedPopupView();

    expect(view.id).toBe("auto-skip-disliked-settings");
    expect(view.label).toBe("Auto-Skip Disliked");
  });

  it("should render a heading", () => {
    const view = createAutoSkipDislikedPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Auto-Skip Disliked Songs");
  });

  it("should render a toggle switch checked when enabled", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: true });
        }
      },
    );

    const view = createAutoSkipDislikedPopupView();
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
    const view = createAutoSkipDislikedPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-auto-skip-disliked-enabled" },
      expect.any(Function),
    );
  });

  it("should send set-auto-skip-disliked-enabled message on toggle", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: false });
        }
      },
    );

    const view = createAutoSkipDislikedPopupView();
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
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-auto-skip-disliked-enabled",
      enabled: true,
    });
  });
});
