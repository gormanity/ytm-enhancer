import type { PopupView } from "@/core/types";

export function createPrecisionVolumePopupView(): PopupView {
  return {
    id: "precision-volume-settings",
    label: "Precision Volume",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Precision Volume";
      container.appendChild(heading);

      const sliderRow = document.createElement("label");
      sliderRow.className = "toggle-row";

      const sliderLabel = document.createElement("span");
      sliderLabel.textContent = "Volume";
      sliderRow.appendChild(sliderLabel);

      const range = document.createElement("input");
      range.type = "range";
      range.min = "0";
      range.max = "100";
      range.value = "100";
      range.disabled = true;
      sliderRow.appendChild(range);

      container.appendChild(sliderRow);

      const numberRow = document.createElement("label");
      numberRow.className = "toggle-row";

      const numberInput = document.createElement("input");
      numberInput.type = "number";
      numberInput.min = "0";
      numberInput.max = "100";
      numberInput.value = "100";
      numberInput.disabled = true;
      numberRow.appendChild(numberInput);

      const suffix = document.createElement("span");
      suffix.textContent = "%";
      numberRow.appendChild(suffix);

      container.appendChild(numberRow);

      chrome.runtime.sendMessage(
        { type: "get-volume" },
        (response: { ok: boolean; data?: number } | null) => {
          if (!response?.ok) return;

          const percent = Math.round((response.data ?? 1) * 100);
          range.value = String(percent);
          numberInput.value = String(percent);
          range.disabled = false;
          numberInput.disabled = false;
        },
      );

      range.addEventListener("input", () => {
        const percent = Number(range.value);
        numberInput.value = String(percent);
        chrome.runtime.sendMessage({
          type: "set-volume",
          volume: percent / 100,
        });
      });

      numberInput.addEventListener("change", () => {
        let percent = Number(numberInput.value);
        percent = Math.max(0, Math.min(100, percent));
        numberInput.value = String(percent);
        range.value = String(percent);
        chrome.runtime.sendMessage({
          type: "set-volume",
          volume: percent / 100,
        });
      });
    },
  };
}
