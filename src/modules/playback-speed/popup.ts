import type { PopupView } from "@/core/types";

const SPEED_OPTIONS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function createPlaybackSpeedPopupView(): PopupView {
  return {
    id: "playback-speed-settings",
    label: "Playback Speed",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Playback Speed";
      container.appendChild(heading);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Speed";
      label.appendChild(text);

      const select = document.createElement("select");
      select.disabled = true;

      for (const speed of SPEED_OPTIONS) {
        const option = document.createElement("option");
        option.value = String(speed);
        option.textContent = `${speed}x`;
        select.appendChild(option);
      }

      label.appendChild(select);
      container.appendChild(label);

      chrome.runtime.sendMessage(
        { type: "get-playback-speed" },
        (response: { ok: boolean; data?: number } | null) => {
          if (!response?.ok) return;

          select.value = String(response.data ?? 1);
          select.disabled = false;
        },
      );

      select.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-playback-speed",
          rate: Number(select.value),
        });
      });
    },
  };
}
