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

      const targetLabel = document.createElement("label");
      targetLabel.className = "toggle-row";

      const targetText = document.createElement("span");
      targetText.textContent = "Display surface";
      targetLabel.appendChild(targetText);

      const targetSelect = document.createElement("select");
      targetSelect.disabled = true;

      const targetOptions = [
        { value: "auto", text: "Auto" },
        { value: "all", text: "All Surfaces" },
        { value: "pip-only", text: "PiP Only" },
        { value: "song-art-only", text: "Song Art Only" },
        { value: "player-bar-only", text: "Player Bar Only" },
      ];

      for (const opt of targetOptions) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        targetSelect.appendChild(option);
      }

      targetLabel.appendChild(targetSelect);
      container.appendChild(targetLabel);

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

      chrome.runtime.sendMessage(
        { type: "get-audio-visualizer-target" },
        (response: { ok: boolean; data?: string }) => {
          if (response?.ok && response.data) {
            targetSelect.value = response.data;
            targetSelect.disabled = false;
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

      targetSelect.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-target",
          target: targetSelect.value,
        });
      });
    },
  };
}
