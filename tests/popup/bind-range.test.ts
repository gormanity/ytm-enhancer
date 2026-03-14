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
    min?: string;
    max?: string;
    numberInputRole?: string;
    displayRole?: string;
  }): HTMLElement {
    const container = document.createElement("div");
    const range = document.createElement("input");
    range.type = "range";
    range.min = opts?.min ?? "0";
    range.max = opts?.max ?? "100";
    range.value = "0";
    range.setAttribute("data-role", opts?.dataRole ?? "my-range");
    container.appendChild(range);

    if (opts?.numberInputRole) {
      const numInput = document.createElement("input");
      numInput.type = "number";
      numInput.setAttribute("data-role", opts.numberInputRole);
      container.appendChild(numInput);
    }

    if (opts?.displayRole) {
      const span = document.createElement("span");
      span.setAttribute("data-role", opts.displayRole);
      container.appendChild(span);
    }

    return container;
  }

  function getRange(container: HTMLElement, dataRole: string) {
    return container.querySelector<HTMLInputElement>(
      `[data-role="${dataRole}"]`,
    )!;
  }

  function getElement(container: HTMLElement, dataRole: string) {
    return container.querySelector<HTMLElement>(`[data-role="${dataRole}"]`)!;
  }

  it("should disable range initially and send get message", () => {
    const container = createContainer();
    bindRange(container, "my-range", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    const range = getRange(container, "my-range");
    expect(range.disabled).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-my-value" },
      expect.any(Function),
    );
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
    });

    const range = getRange(container, "my-range");
    expect(range.disabled).toBe(false);
    expect(range.value).toBe("75");
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
    });

    expect(getRange(container, "my-range").disabled).toBe(true);
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
    });

    const range = getRange(container, "my-range");
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
      setKey: "volume",
      transformValue: (v) => v / 100,
    });

    const range = getRange(container, "my-range");
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
      parseData: (data) => Math.round((data as number) * 100),
    });

    expect(getRange(container, "my-range").value).toBe("75");
  });

  it("should sync paired number input on load", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 42 });
        }
      },
    );

    const container = createContainer({ numberInputRole: "my-num" });
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      numberInputRole: "my-num",
    });

    const numInput = getRange(container, "my-num");
    expect(numInput.disabled).toBe(false);
    expect(numInput.value).toBe("42");
  });

  it("should sync number input on range input", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer({ numberInputRole: "my-num" });
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      numberInputRole: "my-num",
    });

    const range = getRange(container, "my-range");
    range.value = "70";
    range.dispatchEvent(new Event("input"));

    expect(getRange(container, "my-num").value).toBe("70");
  });

  it("should sync range from number input change and clamp", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer({ numberInputRole: "my-num" });
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      numberInputRole: "my-num",
    });

    const numInput = getRange(container, "my-num");
    numInput.value = "150";
    numInput.dispatchEvent(new Event("change"));

    // Clamped to max of 100
    expect(numInput.value).toBe("100");
    expect(getRange(container, "my-range").value).toBe("100");
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-val",
      value: 100,
    });
  });

  it("should update display element on load and input", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-val") {
          callback?.({ ok: true, data: 50 });
        }
      },
    );

    const container = createContainer({ displayRole: "my-display" });
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      displayRole: "my-display",
      formatDisplay: (v) => `${v}%`,
    });

    const display = getElement(container, "my-display");
    expect(display.textContent).toBe("50%");

    const range = getRange(container, "my-range");
    range.value = "80";
    range.dispatchEvent(new Event("input"));

    expect(display.textContent).toBe("80%");
  });

  it("should apply filled-track gradient when fillTrack is true", () => {
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
      fillTrack: true,
    });

    const range = getRange(container, "my-range");
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
      onLoaded,
    });

    expect(onLoaded).toHaveBeenCalledWith(getRange(container, "my-range"));
  });

  it("should disable number input initially", () => {
    const container = createContainer({ numberInputRole: "my-num" });
    bindRange(container, "my-range", {
      getType: "get-val",
      setType: "set-val",
      numberInputRole: "my-num",
    });

    expect(getRange(container, "my-num").disabled).toBe(true);
  });

  it("should do nothing if data-role element is missing", () => {
    const container = document.createElement("div");
    bindRange(container, "nonexistent", {
      getType: "get-val",
      setType: "set-val",
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
