import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPrecisionVolumePopupView } from "@/modules/precision-volume/popup";

describe("precision volume popup view", () => {
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
    const view = createPrecisionVolumePopupView();

    expect(view.id).toBe("precision-volume-settings");
    expect(view.label).toBe("Precision Volume");
  });

  it("should render a heading", () => {
    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Precision Volume");
  });

  it("should render a range slider and number input", () => {
    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    const range = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    expect(range).not.toBeNull();
    expect(range?.min).toBe("0");
    expect(range?.max).toBe("100");

    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    expect(number).not.toBeNull();
    expect(number?.min).toBe("0");
    expect(number?.max).toBe("100");
  });

  it("should query current volume on render", () => {
    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-volume" },
      expect.any(Function),
    );
  });

  it("should set slider and input values when response arrives", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true, data: 0.75 });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const range = container.querySelector<HTMLInputElement>(
        'input[type="range"]',
      );
      expect(range?.value).toBe("75");
    });

    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    expect(number?.value).toBe("75");
  });

  it("should default to 100 when response has no data", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const range = container.querySelector<HTMLInputElement>(
        'input[type="range"]',
      );
      expect(range?.value).toBe("100");
    });
  });

  it("should send set-volume when slider changes", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true, data: 1 });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const range = container.querySelector<HTMLInputElement>(
        'input[type="range"]',
      );
      expect(range?.disabled).toBe(false);
    });

    const range = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    )!;
    range.value = "50";
    range.dispatchEvent(new Event("input"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-volume",
      volume: 0.5,
    });
  });

  it("should sync number input when slider changes", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true, data: 1 });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const range = container.querySelector<HTMLInputElement>(
        'input[type="range"]',
      );
      expect(range?.disabled).toBe(false);
    });

    const range = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    )!;
    range.value = "30";
    range.dispatchEvent(new Event("input"));

    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    expect(number.value).toBe("30");
  });

  it("should send set-volume when number input changes", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true, data: 1 });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const number = container.querySelector<HTMLInputElement>(
        'input[type="number"]',
      );
      expect(number?.disabled).toBe(false);
    });

    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    number.value = "25";
    number.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-volume",
      volume: 0.25,
    });
  });

  it("should sync slider when number input changes", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true, data: 1 });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const number = container.querySelector<HTMLInputElement>(
        'input[type="number"]',
      );
      expect(number?.disabled).toBe(false);
    });

    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;
    number.value = "60";
    number.dispatchEvent(new Event("change"));

    const range = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    )!;
    expect(range.value).toBe("60");
  });

  it("should clamp number input to 0-100", async () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: true, data: 1 });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    await vi.waitFor(() => {
      const number = container.querySelector<HTMLInputElement>(
        'input[type="number"]',
      );
      expect(number?.disabled).toBe(false);
    });

    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    )!;

    number.value = "150";
    number.dispatchEvent(new Event("change"));
    expect(number.value).toBe("100");

    number.value = "-10";
    number.dispatchEvent(new Event("change"));
    expect(number.value).toBe("0");
  });

  it("should remain disabled when response is not ok", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-volume" && callback) {
          callback({ ok: false });
        }
      },
    );

    const view = createPrecisionVolumePopupView();
    const container = document.createElement("div");

    view.render(container);

    const range = container.querySelector<HTMLInputElement>(
      'input[type="range"]',
    );
    const number = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    expect(range?.disabled).toBe(true);
    expect(number?.disabled).toBe(true);
  });
});
