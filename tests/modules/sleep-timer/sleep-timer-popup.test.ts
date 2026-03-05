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

    const select = container.querySelector<HTMLSelectElement>("select")!;
    select.value = "30";
    select.dispatchEvent(new Event("change"));

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

    const buttons = container.querySelectorAll<HTMLButtonElement>("button");
    const cancelBtn = buttons[1]!;
    cancelBtn.click();

    expect(sendMessageMock).toHaveBeenCalledWith(
      { type: "cancel-sleep-timer" },
      expect.any(Function),
    );
  });
});
