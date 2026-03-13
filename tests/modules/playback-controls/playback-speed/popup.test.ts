import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPlaybackSpeedPopupView } from "@/modules/playback-controls/playback-speed/popup";

describe("playback speed popup view", () => {
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
    const view = createPlaybackSpeedPopupView();

    expect(view.id).toBe("playback-speed-settings");
    expect(view.label).toBe("Playback Speed");
  });

  it("should render a heading", () => {
    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Playback Speed");
  });

  it("should render a disabled select with placeholder initially", () => {
    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    const select = container.querySelector("select");
    expect(select).not.toBeNull();
    expect(select?.disabled).toBe(true);
    expect(select?.options).toHaveLength(9);
    expect(select?.options[0].value).toBe("");
    expect(select?.options[0].textContent).toBe("—");
    expect(select?.options[1].value).toBe("0.25");
    expect(select?.options[1].textContent).toBe("0.25x");
    expect(select?.options[4].value).toBe("1");
    expect(select?.options[4].textContent).toBe("1x");
    expect(select?.options[8].value).toBe("2");
    expect(select?.options[8].textContent).toBe("2x");
  });

  it("should query current speed on render", () => {
    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-playback-speed" },
      expect.any(Function),
    );
  });

  it("should select current speed and enable when response arrives", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-playback-speed" && callback) {
          callback({
            ok: true,
            data: 1.5,
          });
        }
      },
    );

    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("1.5");
  });

  it("should default to 1x when response has no data", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-playback-speed" && callback) {
          callback({ ok: true, data: undefined });
        }
      },
    );

    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("1");
  });

  it("should send set-playback-speed on change", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-playback-speed" && callback) {
          callback({ ok: true, data: 1 });
        }
      },
    );

    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    select.value = "2";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-playback-speed",
      rate: 2,
    });
  });

  it("should remain disabled when response is not ok", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-playback-speed" && callback) {
          callback({ ok: false });
        }
      },
    );

    const view = createPlaybackSpeedPopupView();
    const container = document.createElement("div");

    view.render(container);

    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select?.disabled).toBe(true);
  });
});
