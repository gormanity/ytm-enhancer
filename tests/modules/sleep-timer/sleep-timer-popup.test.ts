import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSleepTimerPopupView } from "@/modules/sleep-timer/popup";

describe("sleep timer popup view", () => {
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
    const view = createSleepTimerPopupView();

    expect(view.id).toBe("sleep-timer-settings");
    expect(view.label).toBe("Sleep Timer");
  });

  it("should query timer state on render", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        callback?.({
          ok: true,
          data: { active: false, remainingMs: 0 },
        });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-sleep-timer-state" },
      expect.any(Function),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-sleep-timer-notify-enabled" },
      expect.any(Function),
    );
    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "get-sleep-timer-mode" },
      expect.any(Function),
    );
  });

  it("should send start message with selected duration", async () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: { active: false, remainingMs: 0 },
          });
          return;
        }
        callback?.({ ok: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const hours = container.querySelector<HTMLInputElement>(
      'input[aria-label="Hours"]',
    )!;
    const minutes = container.querySelector<HTMLInputElement>(
      'input[aria-label="Minutes"]',
    )!;
    hours.value = "00";
    minutes.value = "30";
    minutes.dispatchEvent(new Event("input"));

    const startBtn =
      container.querySelector<HTMLButtonElement>("button.primary-btn")!;
    startBtn.click();

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "start-sleep-timer", durationMs: 30 * 60 * 1000 },
      expect.any(Function),
    );
  });

  it("should send cancel message", () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: { active: true, remainingMs: 5 * 60 * 1000 },
          });
          return;
        }
        callback?.({ ok: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const cancelBtn = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Cancel");
    if (!cancelBtn) throw new Error("Cancel button not found");
    cancelBtn.click();

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "cancel-sleep-timer" },
      expect.any(Function),
    );
  });

  it("should send start message with custom duration", () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: { active: false, remainingMs: 0, endAt: null },
          });
          return;
        }
        callback?.({ ok: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const hours = container.querySelector<HTMLInputElement>(
      'input[aria-label="Hours"]',
    )!;
    const minutes = container.querySelector<HTMLInputElement>(
      'input[aria-label="Minutes"]',
    )!;
    hours.value = "01";
    minutes.value = "17";
    minutes.dispatchEvent(new Event("input"));

    const startBtn =
      container.querySelector<HTMLButtonElement>("button.primary-btn")!;
    startBtn.click();

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "start-sleep-timer", durationMs: 77 * 60 * 1000 },
      expect.any(Function),
    );
  });

  it("should label start button as restart when timer is active", () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: true,
              remainingMs: 5 * 60 * 1000,
              endAt: Date.now() + 5 * 60 * 1000,
              lastPausedAt: null,
            },
          });
          return;
        }
        callback?.({ ok: true, data: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const startBtn =
      container.querySelector<HTMLButtonElement>("button.primary-btn")!;
    expect(startBtn.textContent).toBe("Restart Timer");
  });

  it("should send notification setting updates on toggle", () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: false,
              remainingMs: 0,
              endAt: null,
              lastPausedAt: null,
            },
          });
          return;
        }
        if (message.type === "get-sleep-timer-notify-enabled") {
          callback?.({ ok: true, data: true });
          return;
        }
        callback?.({ ok: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const rows =
      container.querySelectorAll<HTMLLabelElement>("label.toggle-row");
    const notificationRow = Array.from(rows).find(
      (row) =>
        row.querySelector("span")?.textContent ===
        "Show notification when timer ends",
    );
    if (!notificationRow) throw new Error("Notification row not found");
    const notificationToggle = notificationRow.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    if (!notificationToggle) throw new Error("Notification toggle not found");
    notificationToggle.checked = false;
    notificationToggle.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-sleep-timer-notify-enabled",
      enabled: false,
    });
  });

  it("should reject fractional minute values", () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: false,
              remainingMs: 0,
              endAt: null,
              lastPausedAt: null,
            },
          });
          return;
        }
        if (message.type === "get-sleep-timer-notify-enabled") {
          callback?.({ ok: true, data: true });
          return;
        }
        callback?.({ ok: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const hours = container.querySelector<HTMLInputElement>(
      'input[aria-label="Hours"]',
    )!;
    const minutes = container.querySelector<HTMLInputElement>(
      'input[aria-label="Minutes"]',
    )!;
    hours.value = "00";
    minutes.value = "20.3";
    minutes.dispatchEvent(new Event("input"));

    const startBtn =
      container.querySelector<HTMLButtonElement>("button.primary-btn")!;
    startBtn.click();

    expect(sendMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "start-sleep-timer" }),
      expect.any(Function),
    );
  });

  it("should persist mode changes", () => {
    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: false,
              remainingMs: 0,
              endAt: null,
              lastPausedAt: null,
            },
          });
          return;
        }
        if (message.type === "get-sleep-timer-notify-enabled") {
          callback?.({ ok: true, data: true });
          return;
        }
        if (message.type === "get-sleep-timer-mode") {
          callback?.({ ok: true, data: "duration" });
          return;
        }
        callback?.({ ok: true });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    view.render(container);

    const modeSelect = container.querySelector<HTMLSelectElement>("select")!;
    modeSelect.value = "absolute";
    modeSelect.dispatchEvent(new Event("change"));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-sleep-timer-mode",
      mode: "absolute",
    });
  });

  it("should clear polling timers on cleanup", () => {
    vi.useFakeTimers();
    sendMessageMock.mockImplementation(
      (_message: { type: string }, callback?: (response: unknown) => void) => {
        callback?.({
          ok: true,
          data: {
            active: false,
            remainingMs: 0,
            endAt: null,
            lastPausedAt: null,
          },
        });
      },
    );

    const view = createSleepTimerPopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    expect(typeof cleanup).toBe("function");
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(2);

    (cleanup as () => void)();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
