import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  bindModuleRange,
  bindModuleSelect,
  bindModuleToggle,
  createActionRow,
  createStatusMessage,
} from "@/popup/module-ui";

describe("module popup UI kit", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sendMessageMock = vi.fn();
    vi.stubGlobal("chrome", {
      runtime: { sendMessage: sendMessageMock },
    });
  });

  it("wraps toggle binding with standard load and set behavior", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if ((message as { type: string }).type === "get-enabled") {
          callback?.({ ok: true, data: true });
        }
      },
    );
    const container = document.createElement("div");
    container.innerHTML = `<input type="checkbox" data-role="feature-toggle" />`;

    bindModuleToggle(container, "feature-toggle", {
      getType: "get-enabled",
      setType: "set-enabled",
    });
    const toggle = container.querySelector<HTMLInputElement>(
      '[data-role="feature-toggle"]',
    )!;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(toggle.disabled).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-enabled",
      enabled: false,
    });
  });

  it("wraps select binding with parse and transform hooks", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if ((message as { type: string }).type === "get-mode") {
          callback?.({ ok: true, data: { mode: "a" } });
        }
      },
    );
    const container = document.createElement("div");
    container.innerHTML = `
      <select data-role="feature-select">
        <option value="a">A</option>
        <option value="b">B</option>
      </select>
    `;

    bindModuleSelect(container, "feature-select", {
      getType: "get-mode",
      setType: "set-mode",
      setKey: "mode",
      parseData: (data) => (data as { mode: string }).mode,
      transformValue: (value) => value.toUpperCase(),
    });
    const select = container.querySelector<HTMLSelectElement>(
      '[data-role="feature-select"]',
    )!;
    select.value = "b";
    select.dispatchEvent(new Event("change"));

    expect(select.disabled).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-mode",
      mode: "B",
    });
  });

  it("wraps range binding with shared range slider behavior", () => {
    sendMessageMock.mockImplementation(
      (message: unknown, callback?: (response: unknown) => void) => {
        if ((message as { type: string }).type === "get-volume") {
          callback?.({ ok: true, data: 0.5 });
        }
      },
    );
    const container = document.createElement("div");
    container.innerHTML = `<div data-role="feature-range"></div>`;

    bindModuleRange(container, "feature-range", {
      getType: "get-volume",
      setType: "set-volume",
      label: "Volume",
      setKey: "volume",
      parseData: (data) => Number(data) * 100,
      transformValue: (value) => value / 100,
      unit: "%",
    });
    const range = container.querySelector<HTMLInputElement>(
      "input.range-slider",
    )!;
    range.value = "75";
    range.dispatchEvent(new Event("input"));

    expect(range.disabled).toBe(false);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-volume",
      volume: 0.75,
    });
  });

  it("creates status messages with tone and text", () => {
    const status = createStatusMessage({
      tone: "warning",
      text: "Needs attention",
    });

    expect(status.className).toContain("module-status-message");
    expect(status.className).toContain("module-status-message-warning");
    expect(status.textContent).toBe("Needs attention");
  });

  it("creates action rows that restore button state after async clicks", async () => {
    const onClick = vi.fn(async () => {});
    const row = createActionRow({
      label: "Preview",
      buttonLabel: "Run",
      onClick,
    });
    const button = row.querySelector("button")!;

    button.click();
    expect(button.disabled).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(onClick).toHaveBeenCalledOnce();
    expect(button.disabled).toBe(false);
  });
});
