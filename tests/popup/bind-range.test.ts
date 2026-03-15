import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindRange } from "@/popup/bind-range";

describe("bindRange", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: sendMessageMock },
    });
  });

  function createContainer(opts?: {
    dataRole?: string;
    min?: number;
    max?: number;
  }): HTMLElement {
    const container = document.createElement("div");
    const slot = document.createElement("div");
    slot.classList.add("range-slider-grid");
    slot.setAttribute("data-role", opts?.dataRole ?? "my-range");
    if (opts?.min != null) slot.dataset.min = String(opts.min);
    if (opts?.max != null) slot.dataset.max = String(opts.max);
    container.appendChild(slot);
    return container;
  }

  function getRange(container: HTMLElement): HTMLInputElement {
    return container.querySelector<HTMLInputElement>("input.range-slider")!;
  }

  function getNumberInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector<HTMLInputElement>(
      "input.range-slider-number",
    )!;
  }

  it("should inject a range slider and disable it initially", () => {
    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-my-value",
      setType: "set-my-value",
      label: "Test",
    });

    const range = getRange(container);
    expect(range).not.toBeNull();
    expect(range.disabled).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-my-value" },
      expect.any(Function),
    );
  });

  it("should render a label", () => {
    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      label: "Volume",
    });

    const label = container.querySelector(".range-slider-label");
    expect(label?.textContent).toBe("Volume");
  });

  it("should enable range and set value on successful response", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: 75 });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-my-value",
      setType: "set-my-value",
      label: "Test",
    });

    const range = getRange(container);
    expect(range.disabled).toBe(false);
    expect(range.value).toBe("75");
    expect(getNumberInput(container).value).toBe("75");
  });

  it("should stay disabled when response is not ok", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: false });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-my-value",
      setType: "set-my-value",
      label: "Test",
    });

    expect(getRange(container).disabled).toBe(true);
  });

  it("should send set message with default key on input", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-my-value",
      setType: "set-my-value",
      label: "Test",
    });

    const range = getRange(container);
    range.value = "80";
    range.dispatchEvent(new Event("input"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-my-value",
      value: 80,
    });
  });

  it("should use custom setKey and transformValue", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-vol") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-vol",
      setType: "set-vol",
      label: "Volume",
      setKey: "volume",
      transformValue: (v) => v / 100,
    });

    const range = getRange(container);
    range.value = "60";
    range.dispatchEvent(new Event("input"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-vol",
      volume: 0.6,
    });
  });

  it("should use custom parseData", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-vol") {
          callback?.({ ok: true, data: 0.75 });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-vol",
      setType: "set-vol",
      label: "Volume",
      parseData: (data) => Math.round((data as number) * 100),
    });

    expect(getRange(container).value).toBe("75");
  });

  it("should always apply filled-track gradient", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      label: "Test",
    });

    const range = getRange(container);
    expect(range.style.background).toContain("linear-gradient");
    expect(range.style.background).toContain("50%");
  });

  it("should call onLoaded after successful get", () => {
    const onLoaded = vi.fn();
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      label: "Test",
      onLoaded,
    });

    expect(onLoaded).toHaveBeenCalledWith(getRange(container));
  });

  it("should do nothing if data-role element is missing", () => {
    const container = document.createElement("div");
    bindRange(container, "nonexistent", {
      getType: "get-val",
      setType: "set-val",
      label: "Test",
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("should read min/max from slot data attributes", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 75 });
        }
      },
    );

    const container = createContainer({ min: 50, max: 150 });
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      label: "Test",
    });

    const range = getRange(container);
    expect(range.min).toBe("50");
    expect(range.max).toBe("150");
  });

  it("should display unit suffix", () => {
    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      label: "Volume",
      unit: "%",
    });

    const unit = container.querySelector(".range-slider-unit");
    expect(unit?.textContent).toBe("%");
  });
});
