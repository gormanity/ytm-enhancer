import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSleepTimerPopupView } from "@/modules/sleep-timer/popup";

describe("sleep timer popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let onMessageAddListenerMock: ReturnType<typeof vi.fn>;
  let onMessageRemoveListenerMock: ReturnType<typeof vi.fn>;
  const LAST_PAUSED_AT_SEEN_KEY = "sleep-timer.last-paused-at-seen";
  const ABSOLUTE_TIME_STORAGE_KEY = "sleep-timer.absolute-time";
  let storageData: Record<string, string>;

  beforeEach(() => {
    onMessageAddListenerMock = vi.fn();
    onMessageRemoveListenerMock = vi.fn();
    sendMessageMock = vi.fn();
    storageData = {};

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => (key in storageData ? storageData[key] : null),
      setItem: (key: string, value: string) => {
        storageData[key] = String(value);
      },
      removeItem: (key: string) => {
        delete storageData[key];
      },
      clear: () => {
        storageData = {};
      },
    });

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: onMessageAddListenerMock,
          removeListener: onMessageRemoveListenerMock,
        },
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
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);

    (cleanup as () => void)();
    expect(vi.getTimerCount()).toBe(0);
    expect(onMessageRemoveListenerMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("should hide stale paused message after it has been seen", () => {
    const pausedAt = Date.now() - 8 * 60 * 60 * 1000;
    localStorage.setItem(LAST_PAUSED_AT_SEEN_KEY, String(pausedAt));

    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: false,
              remainingMs: 0,
              endAt: null,
              lastPausedAt: pausedAt,
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

    const pausedHint = container.querySelector<HTMLElement>(
      '[data-role="sleep-paused-at"]',
    );
    expect(pausedHint).not.toBeNull();
    expect(pausedHint?.classList.contains("is-hidden")).toBe(true);
  });

  it("should show a paused message once before hiding stale entries", () => {
    const pausedAt = Date.now() - 8 * 60 * 60 * 1000;

    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: false,
              remainingMs: 0,
              endAt: null,
              lastPausedAt: pausedAt,
            },
          });
          return;
        }
        callback?.({ ok: true, data: true });
      },
    );

    const view = createSleepTimerPopupView();
    const firstContainer = document.createElement("div");
    view.render(firstContainer);

    const firstPausedHint = firstContainer.querySelector<HTMLElement>(
      '[data-role="sleep-paused-at"]',
    );
    expect(firstPausedHint?.classList.contains("is-hidden")).toBe(false);
    expect(localStorage.getItem(LAST_PAUSED_AT_SEEN_KEY)).toBe(
      String(pausedAt),
    );

    const secondContainer = document.createElement("div");
    view.render(secondContainer);

    const secondPausedHint = secondContainer.querySelector<HTMLElement>(
      '[data-role="sleep-paused-at"]',
    );
    expect(secondPausedHint?.classList.contains("is-hidden")).toBe(true);
  });

  it('should replace "Timer is off" with paused message when shown', () => {
    const pausedAt = Date.now();

    sendMessageMock.mockImplementation(
      (message: { type: string }, callback?: (response: unknown) => void) => {
        if (message.type === "get-sleep-timer-state") {
          callback?.({
            ok: true,
            data: {
              active: false,
              remainingMs: 0,
              endAt: null,
              lastPausedAt: pausedAt,
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

    const status = container.querySelector<HTMLElement>(
      '[data-role="sleep-status"]',
    );
    const pausedHint = container.querySelector<HTMLElement>(
      '[data-role="sleep-paused-at"]',
    );

    expect(status?.classList.contains("is-hidden")).toBe(true);
    expect(pausedHint?.classList.contains("is-hidden")).toBe(false);
  });

  it("should persist pause-at time across popup opens", () => {
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
    const containerA = document.createElement("div");
    view.render(containerA);

    const modeSelect = containerA.querySelector<HTMLSelectElement>("select")!;
    modeSelect.value = "absolute";
    modeSelect.dispatchEvent(new Event("change"));

    const absoluteInputA = containerA.querySelector<HTMLInputElement>(
      '[data-role="sleep-absolute-input"]',
    )!;
    absoluteInputA.value = "07:45";
    absoluteInputA.dispatchEvent(new Event("input"));

    expect(localStorage.getItem(ABSOLUTE_TIME_STORAGE_KEY)).toBe("07:45");

    const containerB = document.createElement("div");
    view.render(containerB);
    const absoluteInputB = containerB.querySelector<HTMLInputElement>(
      '[data-role="sleep-absolute-input"]',
    )!;
    expect(absoluteInputB.value).toBe("07:45");
  });
});
