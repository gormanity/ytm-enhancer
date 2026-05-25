import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAutoPlayPopupView } from "@/modules/auto-play/popup";
import { createTestModuleContext } from "../../helpers/module-context";

describe("auto-play popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let addListenerMock: ReturnType<typeof vi.fn>;
  let removeListenerMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    addListenerMock = vi.fn();
    removeListenerMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createAutoPlayPopupView(createTestModuleContext());

    expect(view.id).toBe("auto-play-settings");
    expect(view.label).toBe("Auto-Play");
  });

  it("should render a heading", () => {
    const view = createAutoPlayPopupView(createTestModuleContext());
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

    const view = createAutoPlayPopupView(createTestModuleContext());
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
    const view = createAutoPlayPopupView(createTestModuleContext());
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

    const view = createAutoPlayPopupView(createTestModuleContext());
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

  it("should show browser autoplay warning when Firefox blocks autoplay", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (!callback) return;
        if (message.type === "get-auto-play-status") {
          callback({
            ok: true,
            data: { browserAutoplayBlocked: true },
          });
          return;
        }
        callback({ ok: true, data: "on" });
      },
    );

    const view = createAutoPlayPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const hint = container.querySelector<HTMLElement>(
        '[data-role="auto-play-browser-blocked"]',
      );
      expect(hint?.classList.contains("is-hidden")).toBe(false);
      expect(hint?.classList.contains("status-warning")).toBe(true);
      expect(
        container
          .querySelector<HTMLElement>('[data-role="auto-play-mode-row"]')
          ?.classList.contains("has-following-message"),
      ).toBe(true);
    });
  });

  it("should hide browser autoplay warning when status is clear", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (!callback) return;
        if (message.type === "get-auto-play-status") {
          callback({
            ok: true,
            data: { browserAutoplayBlocked: false },
          });
          return;
        }
        callback({ ok: true, data: "on" });
      },
    );

    const view = createAutoPlayPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const hint = container.querySelector<HTMLElement>(
        '[data-role="auto-play-browser-blocked"]',
      );
      expect(hint?.classList.contains("is-hidden")).toBe(true);
      expect(
        container
          .querySelector<HTMLElement>('[data-role="auto-play-mode-row"]')
          ?.classList.contains("has-following-message"),
      ).toBe(false);
    });
  });

  it("should refresh browser autoplay warning on runtime status changes", () => {
    let runtimeListener: (message: { type: string }) => void = () => {
      throw new Error("Runtime listener was not registered");
    };
    addListenerMock.mockImplementation((listener) => {
      runtimeListener = listener as (message: { type: string }) => void;
    });
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (!callback) return;
        if (message.type === "get-auto-play-status") {
          callback({
            ok: true,
            data: { browserAutoplayBlocked: false },
          });
          return;
        }
        callback({ ok: true, data: "on" });
      },
    );

    const view = createAutoPlayPopupView(createTestModuleContext());
    const container = document.createElement("div");

    view.render(container);
    sendMessageMock.mockClear();

    runtimeListener({ type: "auto-play-status-changed" });

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-auto-play-status" },
      expect.any(Function),
    );
  });
});
