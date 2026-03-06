import type { PopupView } from "@/core/types";

const PRESET_MINUTES = [15, 30, 45, 60, 90];

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

function parseHhMmToMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const totalMinutes = hours * 60 + minutes;
  if (totalMinutes <= 0) return null;
  return totalMinutes;
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

      const presetsLabel = document.createElement("div");
      presetsLabel.textContent = "Quick durations";
      presetsLabel.style.fontSize = "12px";
      presetsLabel.style.color = "var(--text-secondary)";
      card.appendChild(presetsLabel);

      const presetGroup = document.createElement("div");
      presetGroup.style.display = "flex";
      presetGroup.style.gap = "6px";
      presetGroup.style.flexWrap = "wrap";
      presetGroup.style.marginTop = "8px";
      card.appendChild(presetGroup);

      const presetButtons = new Map<number, HTMLButtonElement>();
      let selectedPresetMinutes: number | null = 30;

      const durationRow = document.createElement("label");
      durationRow.className = "field-row";
      durationRow.style.marginTop = "10px";
      card.appendChild(durationRow);

      const durationLabel = document.createElement("span");
      durationLabel.textContent = "Duration (HH:MM)";
      durationRow.appendChild(durationLabel);

      const durationInput = document.createElement("input");
      durationInput.type = "text";
      durationInput.inputMode = "numeric";
      durationInput.value = "00:30";
      durationInput.placeholder = "00:30";
      durationInput.setAttribute("aria-label", "Timer duration in HH:MM");
      durationRow.appendChild(durationInput);

      const durationHint = document.createElement("p");
      durationHint.className = "status-hint";
      durationHint.style.marginTop = "8px";
      durationHint.style.marginBottom = "0";
      durationHint.style.display = "none";
      card.appendChild(durationHint);

      const refreshPresetStyles = () => {
        for (const [minutes, button] of presetButtons) {
          const isSelected = selectedPresetMinutes === minutes;
          button.style.background = isSelected
            ? "var(--accent-color)"
            : "#1a1a1a";
          button.style.color = isSelected ? "white" : "var(--text-color)";
          button.style.borderColor = isSelected
            ? "var(--accent-color)"
            : "var(--border-color)";
        }
      };

      for (const minutes of PRESET_MINUTES) {
        const presetBtn = document.createElement("button");
        presetBtn.className = "secondary-btn";
        presetBtn.textContent = `${minutes}m`;
        presetBtn.style.padding = "6px 10px";
        presetBtn.style.borderRadius = "14px";
        presetBtn.style.border = "1px solid var(--border-color)";
        presetBtn.style.background = "#1a1a1a";
        presetBtn.style.color = "var(--text-color)";
        presetBtn.style.cursor = "pointer";
        presetBtn.addEventListener("click", () => {
          selectedPresetMinutes = minutes;
          durationInput.value = formatMinutesAsHhMm(minutes);
          durationHint.style.display = "none";
          refreshPresetStyles();
          updateStartEnabled();
        });
        presetButtons.set(minutes, presetBtn);
        presetGroup.appendChild(presetBtn);
      }

      const buttons = document.createElement("div");
      buttons.style.display = "flex";
      buttons.style.gap = "8px";
      buttons.style.marginTop = "12px";
      card.appendChild(buttons);

      const startBtn = document.createElement("button");
      startBtn.className = "primary-btn";
      startBtn.textContent = "Start Timer";
      startBtn.style.flex = "1";
      startBtn.style.padding = "10px";
      startBtn.style.background = "var(--accent-color)";
      startBtn.style.color = "white";
      startBtn.style.border = "none";
      startBtn.style.borderRadius = "6px";
      startBtn.style.cursor = "pointer";
      startBtn.style.fontWeight = "600";
      buttons.appendChild(startBtn);

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "secondary-btn";
      cancelBtn.textContent = "Cancel";
      cancelBtn.style.flex = "1";
      cancelBtn.style.padding = "10px";
      cancelBtn.style.borderRadius = "6px";
      cancelBtn.style.border = "1px solid var(--border-color)";
      cancelBtn.style.background = "var(--card-bg)";
      cancelBtn.style.color = "var(--text-color)";
      cancelBtn.style.cursor = "pointer";
      buttons.appendChild(cancelBtn);

      const status = document.createElement("p");
      status.className = "status-hint";
      status.style.marginTop = "12px";
      status.style.marginBottom = "0";
      card.appendChild(status);

      const pausedAt = document.createElement("p");
      pausedAt.className = "status-hint";
      pausedAt.style.marginTop = "8px";
      pausedAt.style.marginBottom = "0";
      pausedAt.style.display = "none";
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

      const getDurationMinutes = (): number | null => {
        return parseHhMmToMinutes(durationInput.value);
      };

      const updateStartEnabled = () => {
        const minutes = getDurationMinutes();
        startBtn.disabled = minutes === null;
        if (minutes === null) {
          durationHint.textContent = "Use HH:MM format (for example, 01:30).";
          durationHint.style.display = "block";
          return;
        }
        durationHint.style.display = "none";
      };

      const applyState = (state: SleepTimerState) => {
        activeEndAt = state.active ? state.endAt : null;
        if (state.active && state.remainingMs > 0) {
          startBtn.textContent = "Restart Timer";
          status.textContent = `Timer active: ${formatRemaining(state.remainingMs)} remaining`;
          cancelBtn.disabled = false;
          pausedAt.style.display = "none";
        } else {
          startBtn.textContent = "Start Timer";
          status.textContent = "Timer is off";
          cancelBtn.disabled = true;
          activeEndAt = null;
          if (typeof state.lastPausedAt === "number") {
            pausedAt.textContent = `Playback paused at ${formatPausedAt(state.lastPausedAt)}`;
            pausedAt.style.display = "block";
          } else {
            pausedAt.style.display = "none";
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
          return;
        }
        status.textContent = `Timer active: ${formatRemaining(remainingMs)} remaining`;
      };

      startBtn.addEventListener("click", () => {
        const minutes = getDurationMinutes();
        if (minutes === null) return;
        startBtn.disabled = true;
        chrome.runtime.sendMessage(
          { type: "start-sleep-timer", durationMs: minutes * 60 * 1000 },
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

      notificationToggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-sleep-timer-notify-enabled",
          enabled: notificationToggle.checked,
        });
      });

      durationInput.addEventListener("input", () => {
        const minutes = parseHhMmToMinutes(durationInput.value);
        selectedPresetMinutes =
          minutes !== null && PRESET_MINUTES.includes(minutes) ? minutes : null;
        refreshPresetStyles();
        updateStartEnabled();
      });

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
