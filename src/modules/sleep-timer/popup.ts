import type { PopupView } from "@/core/types";

const PRESET_MINUTES = [15, 30, 45, 60, 90];

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

      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.gap = "8px";
      row.style.alignItems = "center";
      card.appendChild(row);

      const label = document.createElement("label");
      label.textContent = "Duration";
      label.style.fontSize = "12px";
      label.style.color = "var(--text-secondary)";
      label.style.marginRight = "4px";
      row.appendChild(label);

      const select = document.createElement("select");
      select.style.flex = "1";
      for (const minutes of PRESET_MINUTES) {
        const option = document.createElement("option");
        option.value = String(minutes);
        option.textContent = `${minutes} minutes`;
        select.appendChild(option);
      }
      row.appendChild(select);

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
      status.style.fontSize = "12px";
      status.style.color = "var(--text-secondary)";
      status.style.marginTop = "12px";
      status.style.marginBottom = "0";
      card.appendChild(status);

      let activeEndAt: number | null = null;
      let refreshTimer: number | null = null;

      const applyState = (state: SleepTimerState) => {
        activeEndAt = state.active ? state.endAt : null;
        if (state.active && state.remainingMs > 0) {
          status.textContent = `Active: ${formatRemaining(state.remainingMs)} remaining`;
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
        status.textContent = `Active: ${formatRemaining(remainingMs)} remaining`;
      };

      startBtn.addEventListener("click", () => {
        const minutes = Number(select.value);
        if (!Number.isFinite(minutes) || minutes <= 0) return;
        startBtn.disabled = true;
        chrome.runtime.sendMessage(
          { type: "start-sleep-timer", durationMs: minutes * 60 * 1000 },
          () => {
            startBtn.disabled = false;
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

      queryState();
      refreshTimer = window.setInterval(updateCountdown, 1000);

      // Refresh from background periodically to avoid drift in long sessions.
      window.setInterval(queryState, 15000);

      window.addEventListener(
        "unload",
        () => {
          if (refreshTimer !== null) {
            clearInterval(refreshTimer);
          }
        },
        { once: true },
      );
    },
  };
}
