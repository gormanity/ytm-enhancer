import { describe, it, expect, vi, beforeEach } from "vitest";
import { bindSelect } from "@/popup/bind-select";

describe("bindSelect", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: sendMessageMock },
    });
  });

  function createContainer(
    dataRole: string,
    optionValues: string[] = ["a", "b"],
    includePlaceholder = false,
  ): HTMLElement {
    const container = document.createElement("div");
    const select = document.createElement("select");
    select.setAttribute("data-role", dataRole);
    if (includePlaceholder) {
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select…";
      select.appendChild(placeholder);
    }
    for (const val of optionValues) {
      const option = document.createElement("option");
      option.value = val;
      option.textContent = val;
      select.appendChild(option);
    }
    container.appendChild(select);
    return container;
  }

  function getSelect(container: HTMLElement, dataRole: string) {
    return container.querySelector<HTMLSelectElement>(
      `[data-role="${dataRole}"]`,
    )!;
  }

  it("should disable select initially and send get message", () => {
    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    const select = getSelect(container, "my-select");
    expect(select.disabled).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-my-value" },
      expect.any(Function),
    );
  });

  it("should enable select and set value on successful response", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "b" });
        }
      },
    );

    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    const select = getSelect(container, "my-select");
    expect(select.disabled).toBe(false);
    expect(select.value).toBe("b");
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

    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    const select = getSelect(container, "my-select");
    expect(select.disabled).toBe(true);
  });

  it("should remove placeholder option on success", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "a" });
        }
      },
    );

    const container = createContainer("my-select", ["a", "b"], true);
    const select = getSelect(container, "my-select");
    expect(select.options).toHaveLength(3);

    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    expect(select.options).toHaveLength(2);
    expect(select.querySelector('option[value=""]')).toBeNull();
  });

  it("should send set message with default key on change", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "a" });
        }
      },
    );

    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    const select = getSelect(container, "my-select");
    select.value = "b";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-my-value",
      value: "b",
    });
  });

  it("should use custom setKey", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "a" });
        }
      },
    );

    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
      setKey: "rate",
    });

    const select = getSelect(container, "my-select");
    select.value = "b";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-my-value",
      rate: "b",
    });
  });

  it("should use custom parseData", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: { current: "b" } });
        }
      },
    );

    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
      parseData: (data) => {
        const d = data as { current: string | null };
        return d?.current ?? "a";
      },
    });

    const select = getSelect(container, "my-select");
    expect(select.value).toBe("b");
  });

  it("should use custom transformValue", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "1" });
        }
      },
    );

    const container = createContainer("my-select", ["1", "2"]);
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
      setKey: "rate",
      transformValue: (v) => Number(v),
    });

    const select = getSelect(container, "my-select");
    select.value = "2";
    select.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-my-value",
      rate: 2,
    });
  });

  it("should call onLoaded after successful get", () => {
    const onLoaded = vi.fn();
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "a" });
        }
      },
    );

    const container = createContainer("my-select");
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
      onLoaded,
    });

    expect(onLoaded).toHaveBeenCalledWith(getSelect(container, "my-select"));
  });

  it("should not send set message when value is empty", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        const msg = message as { type: string };
        if (msg.type === "get-my-value") {
          callback?.({ ok: true, data: "a" });
        }
      },
    );

    const container = createContainer("my-select", ["a"], true);
    bindSelect(container, "my-select", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    // Manually add back a placeholder to simulate selecting it
    const select = getSelect(container, "my-select");
    const empty = document.createElement("option");
    empty.value = "";
    select.appendChild(empty);
    select.value = "";
    select.dispatchEvent(new Event("change"));

    // Only the GET message should have been sent, not a SET
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("should do nothing if data-role element is missing", () => {
    const container = document.createElement("div");
    bindSelect(container, "nonexistent", {
      getType: "get-my-value",
      setType: "set-my-value",
    });

    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
