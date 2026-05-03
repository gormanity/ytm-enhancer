import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAutoPlayPopupView } from "@/modules/auto-play/popup";

describe("auto-play popup view", () => {
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
    const view = createAutoPlayPopupView();

    expect(view.id).toBe("auto-play-settings");
    expect(view.label).toBe("Auto-Play");
  });

  it("should render a heading", () => {
    const view = createAutoPlayPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Auto-Play");
  });

  it("should render a mode selector with current mode", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: "on" });
        }
      },
    );

    const view = createAutoPlayPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select).not.toBeNull();
      expect(select?.value).toBe("on");
      expect(select?.disabled).toBe(false);
    });
  });

  it("should query current mode on render", () => {
    const view = createAutoPlayPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-auto-play-mode" },
      expect.any(Function),
    );
  });

  it("should send set-auto-play-mode message on change", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if (callback) {
          callback({ ok: true, data: "default" });
        }
      },
    );

    const view = createAutoPlayPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    select.value = "off";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-auto-play-mode",
      mode: "off",
    });
  });
});
