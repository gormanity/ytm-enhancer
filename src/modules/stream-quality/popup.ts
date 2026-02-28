import type { PopupView } from "@/core/types";

/** YTM audio quality values mapped to display labels. */
const QUALITY_OPTIONS = [
  { value: "1", label: "Low" },
  { value: "2", label: "Normal" },
  { value: "3", label: "High" },
];

export function createStreamQualityPopupView(): PopupView {
  return {
    id: "stream-quality-settings",
    label: "Stream Quality",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Audio Quality";
      container.appendChild(heading);

      const label = document.createElement("label");
      label.className = "toggle-row";

      const text = document.createElement("span");
      text.textContent = "Quality";
      label.appendChild(text);

      const select = document.createElement("select");
      select.disabled = true;

      for (const opt of QUALITY_OPTIONS) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        select.appendChild(option);
      }

      label.appendChild(select);
      container.appendChild(label);

      chrome.runtime.sendMessage(
        { type: "get-stream-quality" },
        (
          response: { ok: boolean; data?: { current: string | null } } | null,
        ) => {
          if (!response?.ok) return;

          if (response.data?.current) {
            select.value = response.data.current;
          }
          select.disabled = false;
        },
      );

      select.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-stream-quality",
          value: select.value,
        });
      });
    },
  };
}
