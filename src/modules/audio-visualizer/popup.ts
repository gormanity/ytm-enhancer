import type { PopupView } from "@/core/types";

/** Create the audio visualizer settings popup view. */
export function createAudioVisualizerPopupView(): PopupView {
  return {
    id: "audio-visualizer-settings",
    label: "Audio Visualizer",
    render(container: HTMLElement) {
      container.innerHTML = "";

      const heading = document.createElement("h2");
      heading.textContent = "Audio Visualizer";
      container.appendChild(heading);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "toggle-row";

      const toggleText = document.createElement("span");
      toggleText.textContent = "Enable audio visualizer";
      toggleLabel.appendChild(toggleText);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.disabled = true;
      toggleLabel.appendChild(toggle);

      container.appendChild(toggleLabel);

      const styleLabel = document.createElement("label");
      styleLabel.className = "toggle-row";

      const styleText = document.createElement("span");
      styleText.textContent = "Visualization style";
      styleLabel.appendChild(styleText);

      const select = document.createElement("select");
      select.disabled = true;

      const options = [
        { value: "bars", text: "Frequency Bars" },
        { value: "waveform", text: "Waveform" },
        { value: "circular", text: "Circular" },
      ];

      for (const opt of options) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        select.appendChild(option);
      }

      styleLabel.appendChild(select);
      container.appendChild(styleLabel);

      chrome.runtime.sendMessage(
        { type: "get-audio-visualizer-enabled" },
        (response: { ok: boolean; data?: boolean }) => {
          if (response?.ok) {
            toggle.checked = response.data === true;
            toggle.disabled = false;
          }
        },
      );

      chrome.runtime.sendMessage(
        { type: "get-audio-visualizer-style" },
        (response: { ok: boolean; data?: string }) => {
          if (response?.ok && response.data) {
            select.value = response.data;
            select.disabled = false;
          }
        },
      );

      toggle.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-enabled",
          enabled: toggle.checked,
        });
      });

      select.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-style",
          style: select.value,
        });
      });
    },
  };
}
