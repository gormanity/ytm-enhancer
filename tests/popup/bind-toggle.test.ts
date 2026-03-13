import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindToggle } from "@/popup/bind-toggle";

describe("bindToggle", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: sendMessageMock },
    });
  });

  function createContainer(dataRole: string): HTMLElement {
    const container = document.createElement("div");
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.setAttribute("data-role", dataRole);
    container.appendChild(toggle);
    return container;
  }

  function getToggle(container: HTMLElement, dataRole: string) {
    return container.querySelector<HTMLInputElement>(
      `[data-role="${dataRole}"]`,
    )!;
  }

  it("should disable toggle initially and send get message", () => {
    const container = createContainer("my-toggle");
    bindToggle(container, "my-toggle", {
      getType: "get-my-setting",
      setType: "set-my-setting",
    });

    const toggle = getToggle(container, "my-toggle");
    expect(toggle.disabled).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-my-setting" },
      expect.any(Function),
    );
  });

  it("should enable and check toggle on successful response", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-setting") {
          callback?.({ ok: true, data: true });
        }
      },
    );

    const container = createContainer("my-toggle");
    bindToggle(container, "my-toggle", {
      getType: "get-my-setting",
      setType: "set-my-setting",
    });

    const toggle = getToggle(container, "my-toggle");
    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(true);
  });

  it("should enable and uncheck toggle when data is false", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-setting") {
          callback?.({ ok: true, data: false });
        }
      },
    );

    const container = createContainer("my-toggle");
    bindToggle(container, "my-toggle", {
      getType: "get-my-setting",
      setType: "set-my-setting",
    });

    const toggle = getToggle(container, "my-toggle");
    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(false);
  });

  it("should stay disabled when response is not ok", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-setting") {
          callback?.({ ok: false });
        }
      },
    );

    const container = createContainer("my-toggle");
    bindToggle(container, "my-toggle", {
      getType: "get-my-setting",
      setType: "set-my-setting",
    });

    const toggle = getToggle(container, "my-toggle");
    expect(toggle.disabled).toBe(true);
  });

  it("should send set message on change", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-setting") {
          callback?.({ ok: true, data: false });
        }
      },
    );

    const container = createContainer("my-toggle");
    bindToggle(container, "my-toggle", {
      getType: "get-my-setting",
      setType: "set-my-setting",
    });

    const toggle = getToggle(container, "my-toggle");
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-my-setting",
      enabled: true,
    });
  });

  it("should do nothing if data-role element is missing", () => {
    const container = document.createElement("div");
    bindToggle(container, "nonexistent", {
      getType: "get-my-setting",
      setType: "set-my-setting",
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
