import { describe, it, expect, vi, beforeEach } from "vitest";
import { createStreamQualityPopupView } from "@/modules/stream-quality/popup";

describe("stream quality popup view", () => {
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
    const view = createStreamQualityPopupView();

    expect(view.id).toBe("stream-quality-settings");
    expect(view.label).toBe("Stream Quality");
  });

  it("should render a heading", () => {
    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Audio Quality");
  });

  it("should render a disabled select with three options initially", () => {
    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select).not.toBeNull();
    expect(select?.disabled).toBe(true);
    expect(select?.options).toHaveLength(3);
    expect(select?.options[0].value).toBe("1");
    expect(select?.options[0].textContent).toBe("Low");
    expect(select?.options[1].value).toBe("2");
    expect(select?.options[1].textContent).toBe("Normal");
    expect(select?.options[2].value).toBe("3");
    expect(select?.options[2].textContent).toBe("High");
  });

  it("should query current quality on render", () => {
    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-stream-quality" },
      expect.any(Function),
    );
  });

  it("should select current quality and enable when response arrives", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-stream-quality" && callback) {
          callback({
            ok: true,
            data: { current: "3" },
          });
        }
      },
    );

    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    expect(select.value).toBe("3");
  });

  it("should enable select even when current is null", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-stream-quality" && callback) {
          callback({
            ok: true,
            data: { current: null },
          });
        }
      },
    );

    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });
  });

  it("should send set-stream-quality on change", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-stream-quality" && callback) {
          callback({
            ok: true,
            data: { current: "2" },
          });
        }
      },
    );

    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const select = container.querySelector<HTMLSelectElement>("select");
      expect(select?.disabled).toBe(false);
    });

    const select = container.querySelector<HTMLSelectElement>("select")!;
    select.value = "3";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-stream-quality",
      value: "3",
    });
  });

  it("should remain disabled when response is not ok", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-stream-quality" && callback) {
          callback({ ok: false });
        }
      },
    );

    const view = createStreamQualityPopupView();
    const container = document.createElement("div");

    view.render(container);

    const select = container.querySelector<HTMLSelectElement>("select");
    expect(select?.disabled).toBe(true);
  });
});
