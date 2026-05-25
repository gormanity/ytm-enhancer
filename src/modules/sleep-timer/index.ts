import type { FeatureModule, ModuleContext, PopupView } from "@/core/types";
import type { ModuleHandlerRegistry } from "@/core/messaging";
import { createSleepTimerPopupView } from "./popup";

const SLEEP_TIMER_ALARM = "sleep-timer";

export interface SleepTimerState {
  active: boolean;
  remainingMs: number;
  endAt: number | null;
  lastPausedAt: number | null;
}

export class SleepTimerModule implements FeatureModule {
  readonly id = "sleep-timer";
  readonly name = "Sleep Timer";
  readonly description = "Pause playback after a selected duration";

  private enabled = true;
  private context: ModuleContext | null = null;
  private endAt: number | null = null;
  private lastPausedAt: number | null = null;
  private notifyOnEnd = true;
  private mode: "duration" | "absolute" = "duration";

  init(context?: ModuleContext): void {
    this.context = context ?? null;
  }

  destroy(): void {
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  getPopupViews(context: ModuleContext): PopupView[] {
    return [createSleepTimerPopupView(context)];
  }

  registerHandlers(
    registry: ModuleHandlerRegistry,
    _context: ModuleContext,
  ): void {
    registry.on("get-sleep-timer-state", async () => ({
      ok: true,
      data: this.getState(),
    }));
    registry.on("start-sleep-timer", async (message) => {
      const durationMs = Number(message.durationMs);
      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        return { ok: false, error: "Invalid duration" };
      }
      await this.start(durationMs);
      return { ok: true };
    });
    registry.on("cancel-sleep-timer", async () => {
      await this.cancel();
      return { ok: true };
    });
    registry.on("get-sleep-timer-notify-enabled", async () => ({
      ok: true,
      data: this.notifyOnEnd,
    }));
    registry.on("set-sleep-timer-notify-enabled", async (message) => {
      this.notifyOnEnd = message.enabled === true;
      await this.save("sleep-timer.notifyOnEnd", this.notifyOnEnd);
      return { ok: true };
    });
    registry.on("get-sleep-timer-mode", async () => ({
      ok: true,
      data: this.mode,
    }));
    registry.on("set-sleep-timer-mode", async (message) => {
      this.mode = message.mode === "absolute" ? "absolute" : "duration";
      await this.save("sleep-timer.mode", this.mode);
      return { ok: true };
    });
  }

  async restore(state: {
    endAt: number | null;
    lastPausedAt: number | null;
    notifyOnEnd: boolean;
    mode: "duration" | "absolute";
  }): Promise<void> {
    this.lastPausedAt = state.lastPausedAt;
    this.notifyOnEnd = state.notifyOnEnd;
    this.mode = state.mode;

    if (state.endAt !== null && state.endAt > Date.now()) {
      this.endAt = state.endAt;
      await chrome.alarms.create(SLEEP_TIMER_ALARM, { when: state.endAt });
      return;
    }

    this.endAt = null;
    await chrome.alarms.clear(SLEEP_TIMER_ALARM);
    await this.save("sleep-timer.endAt", null);
  }

  getState(): SleepTimerState {
    if (this.endAt === null) {
      return {
        active: false,
        remainingMs: 0,
        endAt: null,
        lastPausedAt: this.lastPausedAt,
      };
    }

    const remainingMs = Math.max(0, this.endAt - Date.now());
    if (remainingMs <= 0) {
      return {
        active: false,
        remainingMs: 0,
        endAt: null,
        lastPausedAt: this.lastPausedAt,
      };
    }

    return {
      active: true,
      remainingMs,
      endAt: this.endAt,
      lastPausedAt: this.lastPausedAt,
    };
  }

  async start(durationMs: number): Promise<void> {
    const endAt = Date.now() + durationMs;
    this.endAt = endAt;
    this.lastPausedAt = null;
    await chrome.alarms.clear(SLEEP_TIMER_ALARM);
    await chrome.alarms.create(SLEEP_TIMER_ALARM, { when: endAt });
    await this.save("sleep-timer.endAt", endAt);
    await this.save("sleep-timer.lastPausedAt", null);
    this.notifyStateChanged();
  }

  async cancel(): Promise<void> {
    this.endAt = null;
    await chrome.alarms.clear(SLEEP_TIMER_ALARM);
    await this.save("sleep-timer.endAt", null);
    this.notifyStateChanged();
  }

  async handleAlarm(alarm: chrome.alarms.Alarm): Promise<boolean> {
    if (alarm.name !== SLEEP_TIMER_ALARM) return false;

    this.lastPausedAt = Date.now();
    this.endAt = null;
    await this.save("sleep-timer.endAt", null);
    await this.save("sleep-timer.lastPausedAt", this.lastPausedAt);

    if (this.notifyOnEnd) {
      const pausedAtLabel = new Date(this.lastPausedAt).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      });
      await chrome.notifications.create({
        type: "basic",
        iconUrl: "icon48.png",
        title: "Sleep Timer",
        message: `Playback paused at ${pausedAtLabel}`,
      });
    }

    await this.context?.ytm
      .executePlaybackAction("pause")
      .catch(() => undefined);
    this.notifyStateChanged();
    return true;
  }

  private async save(key: string, value: unknown): Promise<void> {
    await this.context?.state.saveValue(key, value);
  }

  private notifyStateChanged(): void {
    this.context?.popupEvents.broadcast({ type: "sleep-timer-state-changed" });
  }
}
