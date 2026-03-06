import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import templateHtml from "./popup.html?raw";

const PRESET_MINUTES = [15, 30, 45, 60];
const HOURS_STORAGE_KEY = "sleep-timer.duration-hours";
const MINUTES_STORAGE_KEY = "sleep-timer.duration-minutes";
const PAUSED_AT_LAST_SEEN_KEY = "sleep-timer.last-paused-at-seen";
const PAUSED_AT_EPHEMERAL_MS = 30 * 60 * 1000;

type TimerMode = "duration" | "absolute";

interface SleepTimerState {
  active: boolean;
  remainingMs: number;
  endAt: number | null;
  lastPausedAt: number | null;
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatPausedAt(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMinutesAsHhMm(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseHhMmToMinutes(
  hoursValue: string,
  minutesValue: string,
): number | null {
  const hours = Number(hoursValue);
  const minutes = Number(minutesValue);
  if (!Number.isInteger(hours) || hours < 0) return null;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes <= 0) return null;
  return totalMinutes;
}

function computeAbsoluteDurationMs(timeValue: string): number | null {
  const match = timeValue.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }

  const durationMs = target.getTime() - now.getTime();
  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return durationMs;
}

function formatRelativeDuration(durationMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(durationMs / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function getPopupStorage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: unknown }).localStorage;
    if (
      candidate &&
      typeof candidate === "object" &&
      typeof (candidate as Storage).getItem === "function" &&
      typeof (candidate as Storage).setItem === "function"
    ) {
      return candidate as Storage;
    }
    return null;
  } catch {
    return null;
  }
}

function loadStoredSegment(
  key: string,
  min: number,
  max: number,
  fallback: string,
): string {
  const storage = getPopupStorage();
  const raw = storage?.getItem(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return fallback;
  }
  return String(parsed).padStart(2, "0");
}

function persistDurationSegments(
  hoursValue: string,
  minutesValue: string,
): void {
  const storage = getPopupStorage();
  if (!storage) return;

  const parsedHours = Number(hoursValue);
  if (Number.isInteger(parsedHours) && parsedHours >= 0 && parsedHours <= 99) {
    storage.setItem(HOURS_STORAGE_KEY, String(parsedHours));
  }

  const parsedMinutes = Number(minutesValue);
  if (
    Number.isInteger(parsedMinutes) &&
    parsedMinutes >= 0 &&
    parsedMinutes <= 59
  ) {
    storage.setItem(MINUTES_STORAGE_KEY, String(parsedMinutes));
  }
}

function loadStoredInteger(key: string): number | null {
  const storage = getPopupStorage();
  const raw = storage?.getItem(key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function persistStoredInteger(key: string, value: number): void {
  const storage = getPopupStorage();
  if (!storage) return;
  if (!Number.isInteger(value)) return;
  storage.setItem(key, String(value));
}

/** Create the sleep timer settings popup view. */
export function createSleepTimerPopupView(): PopupView {
  return {
    id: "sleep-timer-settings",
    label: "Sleep Timer",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);
      const modeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="sleep-mode-select"]',
      );
      const presetsLabel = container.querySelector<HTMLElement>(
        '[data-role="sleep-presets-label"]',
      );
      const presetGroup = container.querySelector<HTMLElement>(
        '[data-role="sleep-preset-group"]',
      );
      const durationRow = container.querySelector<HTMLElement>(
        '[data-role="sleep-duration-row"]',
      );
      const hoursInput = container.querySelector<HTMLInputElement>(
        '[data-role="sleep-hours-input"]',
      );
      const minutesInput = container.querySelector<HTMLInputElement>(
        '[data-role="sleep-minutes-input"]',
      );
      const absoluteRow = container.querySelector<HTMLElement>(
        '[data-role="sleep-absolute-row"]',
      );
      const absoluteInput = container.querySelector<HTMLInputElement>(
        '[data-role="sleep-absolute-input"]',
      );
      const durationHint = container.querySelector<HTMLElement>(
        '[data-role="sleep-duration-hint"]',
      );
      const absolutePreview = container.querySelector<HTMLElement>(
        '[data-role="sleep-absolute-preview"]',
      );
      const startBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="sleep-start-btn"]',
      );
      const cancelBtn = container.querySelector<HTMLButtonElement>(
        '[data-role="sleep-cancel-btn"]',
      );
      const status = container.querySelector<HTMLElement>(
        '[data-role="sleep-status"]',
      );
      const pausedAt = container.querySelector<HTMLElement>(
        '[data-role="sleep-paused-at"]',
      );
      const notificationToggle = container.querySelector<HTMLInputElement>(
        '[data-role="sleep-notification-toggle"]',
      );
      if (
        !modeSelect ||
        !presetsLabel ||
        !presetGroup ||
        !durationRow ||
        !hoursInput ||
        !minutesInput ||
        !absoluteRow ||
        !absoluteInput ||
        !durationHint ||
        !absolutePreview ||
        !startBtn ||
        !cancelBtn ||
        !status ||
        !pausedAt ||
        !notificationToggle
      ) {
        return;
      }

      // Normalize textContent so tests and behavior don't depend on template whitespace.
      startBtn.textContent = "Start Timer";
      cancelBtn.textContent = "Cancel";
      hoursInput.value = loadStoredSegment(HOURS_STORAGE_KEY, 0, 99, "00");
      minutesInput.value = loadStoredSegment(MINUTES_STORAGE_KEY, 0, 59, "30");

      const presetButtons = new Map<number, HTMLButtonElement>();
      const presetButtonElements =
        container.querySelectorAll<HTMLButtonElement>("[data-minutes]");
      for (const presetBtn of presetButtonElements) {
        const minutes = Number(presetBtn.dataset.minutes);
        if (!Number.isFinite(minutes)) continue;
        presetButtons.set(minutes, presetBtn);
      }

      let selectedPresetMinutes: number | null = 30;
      let mode: TimerMode = "duration";
      const initialMinutes = parseHhMmToMinutes(
        hoursInput.value,
        minutesInput.value,
      );
      if (initialMinutes !== null && PRESET_MINUTES.includes(initialMinutes)) {
        selectedPresetMinutes = initialMinutes;
      } else {
        selectedPresetMinutes = null;
      }

      const refreshPresetStyles = () => {
        for (const [minutes, button] of presetButtons) {
          const isSelected = selectedPresetMinutes === minutes;
          button.classList.toggle("sleep-preset-btn--selected", isSelected);
        }
      };

      for (const minutes of PRESET_MINUTES) {
        const presetBtn = presetButtons.get(minutes);
        if (!presetBtn) continue;
        presetBtn.addEventListener("click", () => {
          selectedPresetMinutes = minutes;
          const [hh, mm] = formatMinutesAsHhMm(minutes).split(":");
          hoursInput.value = hh;
          minutesInput.value = mm;
          mode = "duration";
          modeSelect.value = "duration";
          updateModeVisibility();
          refreshPresetStyles();
          persistDurationSegments(hoursInput.value, minutesInput.value);
          updateStartEnabled();
        });
      }

      let activeEndAt: number | null = null;
      let countdownTimer: number | null = null;
      let statePollTimer: number | null = null;

      const clampAndPadSegment = (
        input: HTMLInputElement,
        min: number,
        max: number,
      ) => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed)) return;
        const next = Math.max(min, Math.min(max, Math.floor(parsed)));
        input.value = String(next).padStart(2, "0");
      };

      const handleArrowAdjust = (
        event: KeyboardEvent,
        input: HTMLInputElement,
        min: number,
        max: number,
      ) => {
        if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
        event.preventDefault();
        const current = Number(input.value);
        const base = Number.isFinite(current) ? current : min;
        const delta = event.key === "ArrowUp" ? 1 : -1;
        const next = Math.max(min, Math.min(max, base + delta));
        input.value = String(next).padStart(2, "0");
        input.dispatchEvent(new Event("input"));
      };

      const getDurationMs = (): number | null => {
        if (mode === "duration") {
          const minutes = parseHhMmToMinutes(
            hoursInput.value,
            minutesInput.value,
          );
          return minutes === null ? null : minutes * 60 * 1000;
        }
        return computeAbsoluteDurationMs(absoluteInput.value);
      };

      const updateModeVisibility = () => {
        const showDuration = mode === "duration";
        presetsLabel.classList.toggle("is-hidden", !showDuration);
        presetGroup.classList.toggle("is-hidden", !showDuration);
        durationRow.classList.toggle("is-hidden", !showDuration);
        absoluteRow.classList.toggle("is-hidden", showDuration);
      };

      const updateStartEnabled = () => {
        const durationMs = getDurationMs();
        startBtn.disabled = durationMs === null;

        if (durationMs === null) {
          durationHint.textContent =
            mode === "duration"
              ? "Enter a valid HH:MM duration greater than 00:00."
              : "Choose a valid clock time.";
          durationHint.classList.remove("is-hidden");
          absolutePreview.classList.add("is-hidden");
          return;
        }

        durationHint.classList.add("is-hidden");
        if (mode === "absolute") {
          absolutePreview.textContent = `Will pause in ${formatRelativeDuration(durationMs)}.`;
          absolutePreview.classList.remove("is-hidden");
        } else {
          absolutePreview.classList.add("is-hidden");
        }
      };

      const applyState = (state: SleepTimerState) => {
        activeEndAt = state.active ? state.endAt : null;
        if (state.active && state.remainingMs > 0) {
          startBtn.textContent = "Restart Timer";
          status.textContent = `Timer active: ${formatRemaining(state.remainingMs)} remaining`;
          status.classList.remove("is-hidden");
          cancelBtn.disabled = false;
          cancelBtn.classList.remove("is-hidden");
          pausedAt.classList.add("is-hidden");
        } else {
          startBtn.textContent = "Start Timer";
          status.textContent = "Timer is off";
          status.classList.remove("is-hidden");
          cancelBtn.disabled = true;
          cancelBtn.classList.add("is-hidden");
          activeEndAt = null;
          if (typeof state.lastPausedAt === "number") {
            const hasExpired =
              Date.now() - state.lastPausedAt > PAUSED_AT_EPHEMERAL_MS;
            const lastSeenPausedAt = loadStoredInteger(PAUSED_AT_LAST_SEEN_KEY);
            const hasBeenSeen = lastSeenPausedAt === state.lastPausedAt;

            // Keep this message visible for each pause event until:
            // 1) a new timer starts (background clears lastPausedAt), or
            // 2) it has been seen in the Sleep Timer module and is older than
            //    the ephemerality window.
            const shouldShow = !hasBeenSeen || !hasExpired;

            persistStoredInteger(PAUSED_AT_LAST_SEEN_KEY, state.lastPausedAt);

            if (shouldShow) {
              pausedAt.textContent = `Playback paused at ${formatPausedAt(state.lastPausedAt)}`;
              status.classList.add("is-hidden");
              pausedAt.classList.remove("is-hidden");
            } else {
              pausedAt.classList.add("is-hidden");
            }
          } else {
            pausedAt.classList.add("is-hidden");
          }
        }
      };

      const queryState = () => {
        chrome.runtime.sendMessage(
          { type: "get-sleep-timer-state" },
          (response: { ok: boolean; data?: SleepTimerState } | null) => {
            if (response?.ok && response.data) {
              applyState(response.data);
            }
          },
        );
      };

      const updateCountdown = () => {
        if (activeEndAt === null) return;
        const remainingMs = activeEndAt - Date.now();
        if (remainingMs <= 0) {
          activeEndAt = null;
          status.textContent = "Timer is off";
          cancelBtn.disabled = true;
          cancelBtn.classList.add("is-hidden");
          return;
        }
        status.textContent = `Timer active: ${formatRemaining(remainingMs)} remaining`;
      };

      startBtn.addEventListener("click", () => {
        const durationMs = getDurationMs();
        if (durationMs === null) return;
        startBtn.disabled = true;
        chrome.runtime.sendMessage(
          { type: "start-sleep-timer", durationMs },
          () => {
            updateStartEnabled();
            queryState();
          },
        );
      });

      cancelBtn.addEventListener("click", () => {
        cancelBtn.disabled = true;
        chrome.runtime.sendMessage({ type: "cancel-sleep-timer" }, () => {
          queryState();
        });
      });

      chrome.runtime.sendMessage(
        { type: "get-sleep-timer-notify-enabled" },
        (response: { ok: boolean; data?: boolean } | null) => {
          if (!response?.ok) return;
          notificationToggle.checked = response.data === true;
          notificationToggle.disabled = false;
        },
      );

      chrome.runtime.sendMessage(
        { type: "get-sleep-timer-mode" },
        (response: { ok: boolean; data?: string } | null) => {
          if (!response?.ok) return;
          mode = response.data === "absolute" ? "absolute" : "duration";
          modeSelect.value = mode;
          updateModeVisibility();
          updateStartEnabled();
        },
      );

      notificationToggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-sleep-timer-notify-enabled",
          enabled: notificationToggle.checked,
        });
      });

      modeSelect.addEventListener("change", () => {
        mode = modeSelect.value === "absolute" ? "absolute" : "duration";
        updateModeVisibility();
        updateStartEnabled();
        chrome.runtime.sendMessage({
          type: "set-sleep-timer-mode",
          mode,
        });
      });

      hoursInput.addEventListener("input", () => {
        if (hoursInput.value.length >= 2) {
          minutesInput.focus();
          minutesInput.select();
        }
        const minutes = parseHhMmToMinutes(
          hoursInput.value,
          minutesInput.value,
        );
        selectedPresetMinutes =
          minutes !== null && PRESET_MINUTES.includes(minutes) ? minutes : null;
        refreshPresetStyles();
        persistDurationSegments(hoursInput.value, minutesInput.value);
        updateStartEnabled();
      });
      minutesInput.addEventListener("input", () => {
        const minutes = parseHhMmToMinutes(
          hoursInput.value,
          minutesInput.value,
        );
        selectedPresetMinutes =
          minutes !== null && PRESET_MINUTES.includes(minutes) ? minutes : null;
        refreshPresetStyles();
        persistDurationSegments(hoursInput.value, minutesInput.value);
        updateStartEnabled();
      });

      absoluteInput.addEventListener("input", updateStartEnabled);

      hoursInput.addEventListener("blur", () =>
        clampAndPadSegment(hoursInput, 0, 99),
      );
      minutesInput.addEventListener("blur", () =>
        clampAndPadSegment(minutesInput, 0, 59),
      );
      hoursInput.addEventListener("blur", () =>
        persistDurationSegments(hoursInput.value, minutesInput.value),
      );
      minutesInput.addEventListener("blur", () =>
        persistDurationSegments(hoursInput.value, minutesInput.value),
      );
      hoursInput.addEventListener("keydown", (event) =>
        handleArrowAdjust(event, hoursInput, 0, 99),
      );
      minutesInput.addEventListener("keydown", (event) =>
        handleArrowAdjust(event, minutesInput, 0, 59),
      );

      updateModeVisibility();
      refreshPresetStyles();
      updateStartEnabled();
      queryState();
      countdownTimer = window.setInterval(updateCountdown, 1000);

      // Refresh from background periodically to avoid drift in long sessions.
      statePollTimer = window.setInterval(queryState, 15000);

      return () => {
        if (countdownTimer !== null) {
          clearInterval(countdownTimer);
        }
        if (statePollTimer !== null) {
          clearInterval(statePollTimer);
        }
      };
    },
  };
}
