import type { PopupView } from "@/core/types";

const PRESET_MINUTES = [15, 30, 45, 60];

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

function computeAbsoluteDurationMs(
  timeValue: string,
  useTomorrow: boolean,
): number | null {
  const match = timeValue.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const now = new Date();
  const target = new Date(now);
  target.setHours(hours, minutes, 0, 0);
  if (useTomorrow || target.getTime() <= now.getTime()) {
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

/** Create the sleep timer settings popup view. */
export function createSleepTimerPopupView(): PopupView {
  return {
    id: "sleep-timer-settings",
    label: "Sleep Timer",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Sleep Timer";
      container.appendChild(heading);

      const card = document.createElement("div");
      card.className = "settings-card";
      container.appendChild(card);

      const modeRow = document.createElement("label");
      modeRow.className = "toggle-row";
      card.appendChild(modeRow);

      const modeLabel = document.createElement("span");
      modeLabel.textContent = "Timer mode";
      modeRow.appendChild(modeLabel);

      const modeSelect = document.createElement("select");
      const durationOption = document.createElement("option");
      durationOption.value = "duration";
      durationOption.textContent = "Duration";
      modeSelect.appendChild(durationOption);
      const atTimeOption = document.createElement("option");
      atTimeOption.value = "absolute";
      atTimeOption.textContent = "At time";
      modeSelect.appendChild(atTimeOption);
      modeRow.appendChild(modeSelect);

      const presetsLabel = document.createElement("div");
      presetsLabel.className = "sleep-presets-label";
      presetsLabel.textContent = "Quick durations";
      card.appendChild(presetsLabel);

      const presetGroup = document.createElement("div");
      presetGroup.className = "sleep-preset-group";
      card.appendChild(presetGroup);

      const presetButtons = new Map<number, HTMLButtonElement>();
      let selectedPresetMinutes: number | null = 30;
      let mode: TimerMode = "duration";

      const durationRow = document.createElement("label");
      durationRow.className = "field-row sleep-duration-row";
      card.appendChild(durationRow);

      const durationLabel = document.createElement("span");
      durationLabel.textContent = "Duration (HH:MM)";
      durationRow.appendChild(durationLabel);

      const timeInputGroup = document.createElement("div");
      timeInputGroup.className = "sleep-time-input-group";
      durationRow.appendChild(timeInputGroup);

      const hoursInput = document.createElement("input");
      hoursInput.type = "number";
      hoursInput.min = "0";
      hoursInput.max = "99";
      hoursInput.step = "1";
      hoursInput.value = "00";
      hoursInput.placeholder = "HH";
      hoursInput.setAttribute("aria-label", "Hours");
      hoursInput.className = "sleep-time-input";
      timeInputGroup.appendChild(hoursInput);

      const colon = document.createElement("span");
      colon.className = "sleep-time-colon";
      colon.textContent = ":";
      timeInputGroup.appendChild(colon);

      const minutesInput = document.createElement("input");
      minutesInput.type = "number";
      minutesInput.min = "0";
      minutesInput.max = "59";
      minutesInput.step = "1";
      minutesInput.value = "30";
      minutesInput.placeholder = "MM";
      minutesInput.setAttribute("aria-label", "Minutes");
      minutesInput.className = "sleep-time-input";
      timeInputGroup.appendChild(minutesInput);

      const absoluteRow = document.createElement("label");
      absoluteRow.className = "field-row sleep-absolute-row is-hidden";
      card.appendChild(absoluteRow);

      const absoluteLabel = document.createElement("span");
      absoluteLabel.textContent = "Pause at";
      absoluteRow.appendChild(absoluteLabel);

      const absoluteInput = document.createElement("input");
      absoluteInput.type = "time";
      absoluteInput.value = "23:00";
      absoluteInput.setAttribute("aria-label", "Pause at time");
      absoluteRow.appendChild(absoluteInput);

      const tomorrowRow = document.createElement("label");
      tomorrowRow.className = "toggle-row is-hidden";
      card.appendChild(tomorrowRow);

      const tomorrowText = document.createElement("span");
      tomorrowText.textContent = "Use tomorrow";
      tomorrowRow.appendChild(tomorrowText);

      const tomorrowToggle = document.createElement("input");
      tomorrowToggle.type = "checkbox";
      tomorrowRow.appendChild(tomorrowToggle);

      const durationHint = document.createElement("p");
      durationHint.className = "status-hint sleep-hint is-hidden";
      card.appendChild(durationHint);

      const absolutePreview = document.createElement("p");
      absolutePreview.className = "status-hint sleep-hint is-hidden";
      card.appendChild(absolutePreview);

      const refreshPresetStyles = () => {
        for (const [minutes, button] of presetButtons) {
          const isSelected = selectedPresetMinutes === minutes;
          button.classList.toggle("sleep-preset-btn--selected", isSelected);
        }
      };

      for (const minutes of PRESET_MINUTES) {
        const presetBtn = document.createElement("button");
        presetBtn.className = "sleep-preset-btn";
        presetBtn.textContent = `${minutes}m`;
        presetBtn.addEventListener("click", () => {
          selectedPresetMinutes = minutes;
          const [hh, mm] = formatMinutesAsHhMm(minutes).split(":");
          hoursInput.value = hh;
          minutesInput.value = mm;
          mode = "duration";
          modeSelect.value = "duration";
          updateModeVisibility();
          refreshPresetStyles();
          updateStartEnabled();
        });
        presetButtons.set(minutes, presetBtn);
        presetGroup.appendChild(presetBtn);
      }

      const buttons = document.createElement("div");
      buttons.className = "sleep-buttons";
      card.appendChild(buttons);

      const startBtn = document.createElement("button");
      startBtn.className = "primary-btn sleep-start-btn";
      startBtn.textContent = "Start Timer";
      buttons.appendChild(startBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary-btn sleep-cancel-btn is-hidden";
      cancelBtn.textContent = "Cancel";
      cancelBtn.disabled = true;
      buttons.appendChild(cancelBtn);

      const status = document.createElement("p");
      status.className = "status-hint sleep-status";
      card.appendChild(status);

      const pausedAt = document.createElement("p");
      pausedAt.className = "status-hint sleep-hint is-hidden";
      card.appendChild(pausedAt);

      const notificationCard = document.createElement("div");
      notificationCard.className = "settings-card";
      container.appendChild(notificationCard);

      const notificationRow = document.createElement("label");
      notificationRow.className = "toggle-row";
      notificationCard.appendChild(notificationRow);

      const notificationText = document.createElement("span");
      notificationText.textContent = "Show notification when timer ends";
      notificationRow.appendChild(notificationText);

      const notificationToggle = document.createElement("input");
      notificationToggle.type = "checkbox";
      notificationToggle.disabled = true;
      notificationRow.appendChild(notificationToggle);

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
        return computeAbsoluteDurationMs(
          absoluteInput.value,
          tomorrowToggle.checked,
        );
      };

      const updateModeVisibility = () => {
        const showDuration = mode === "duration";
        presetsLabel.classList.toggle("is-hidden", !showDuration);
        presetGroup.classList.toggle("is-hidden", !showDuration);
        durationRow.classList.toggle("is-hidden", !showDuration);
        absoluteRow.classList.toggle("is-hidden", showDuration);
        tomorrowRow.classList.toggle("is-hidden", showDuration);
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
          cancelBtn.disabled = false;
          cancelBtn.classList.remove("is-hidden");
          pausedAt.classList.add("is-hidden");
        } else {
          startBtn.textContent = "Start Timer";
          status.textContent = "Timer is off";
          cancelBtn.disabled = true;
          cancelBtn.classList.add("is-hidden");
          activeEndAt = null;
          if (typeof state.lastPausedAt === "number") {
            pausedAt.textContent = `Playback paused at ${formatPausedAt(state.lastPausedAt)}`;
            pausedAt.classList.remove("is-hidden");
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
        updateStartEnabled();
      });

      absoluteInput.addEventListener("input", updateStartEnabled);
      tomorrowToggle.addEventListener("change", updateStartEnabled);

      hoursInput.addEventListener("blur", () =>
        clampAndPadSegment(hoursInput, 0, 99),
      );
      minutesInput.addEventListener("blur", () =>
        clampAndPadSegment(minutesInput, 0, 59),
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

      window.addEventListener(
        "unload",
        () => {
          if (countdownTimer !== null) {
            clearInterval(countdownTimer);
          }
          if (statePollTimer !== null) {
            clearInterval(statePollTimer);
          }
        },
        { once: true },
      );
    },
  };
}
