import type { PopupView } from "@/core/types";

const PRESET_MINUTES = [15, 30, 45, 60, 90];
const CUSTOM_OPTION = "custom";

interface SleepTimerState {
  active: boolean;
  remainingMs: number;
  endAt: number | null;
}

function formatRemaining(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

      const durationRow = document.createElement("label");
      durationRow.className = "toggle-row";
      card.appendChild(durationRow);

      const label = document.createElement("span");
      label.textContent = "Duration";
      durationRow.appendChild(label);

      const select = document.createElement("select");
      select.style.width = "140px";
      for (const minutes of PRESET_MINUTES) {
        const option = document.createElement("option");
        option.value = String(minutes);
        option.textContent = `${minutes} minutes`;
        select.appendChild(option);
      }
      const customOption = document.createElement("option");
      customOption.value = CUSTOM_OPTION;
      customOption.textContent = "Custom…";
      select.appendChild(customOption);
      durationRow.appendChild(select);

      const customRow = document.createElement("label");
      customRow.className = "field-row";
      customRow.style.display = "none";
      card.appendChild(customRow);

      const customLabel = document.createElement("span");
      customLabel.textContent = "Custom minutes";
      customRow.appendChild(customLabel);

      const customInput = document.createElement("input");
      customInput.type = "number";
      customInput.min = "1";
      customInput.step = "1";
      customInput.value = "20";
      customInput.setAttribute("aria-label", "Custom minutes");
      customRow.appendChild(customInput);

      const buttons = document.createElement("div");
      buttons.style.display = "flex";
      buttons.style.gap = "8px";
      buttons.style.marginTop = "12px";
      card.appendChild(buttons);

      const startBtn = document.createElement("button");
      startBtn.className = "primary-btn";
      startBtn.textContent = "Start Timer";
      startBtn.style.flex = "1";
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

      let activeEndAt: number | null = null;
      let countdownTimer: number | null = null;
      let statePollTimer: number | null = null;

      const getDurationMinutes = (): number | null => {
        if (select.value !== CUSTOM_OPTION) {
          const preset = Number(select.value);
          if (!Number.isFinite(preset) || preset <= 0) return null;
          return preset;
        }

        const custom = Number(customInput.value);
        if (!Number.isFinite(custom) || custom <= 0) return null;
        return Math.floor(custom);
      };

      const updateDurationMode = () => {
        const isCustom = select.value === CUSTOM_OPTION;
        customRow.style.display = isCustom ? "flex" : "none";
      };

      const updateStartEnabled = () => {
        startBtn.disabled = getDurationMinutes() === null;
      };

      const applyState = (state: SleepTimerState) => {
        activeEndAt = state.active ? state.endAt : null;
        if (state.active && state.remainingMs > 0) {
          status.textContent = `Timer active: ${formatRemaining(state.remainingMs)} remaining`;
          cancelBtn.disabled = false;
        } else {
          status.textContent = "Timer is off";
          cancelBtn.disabled = true;
          activeEndAt = null;
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

      select.addEventListener("change", () => {
        updateDurationMode();
        updateStartEnabled();
      });
      customInput.addEventListener("input", updateStartEnabled);

      updateDurationMode();
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
