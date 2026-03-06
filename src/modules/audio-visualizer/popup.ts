import type { PopupView } from "@/core/types";
import {
  type VisualizerColorMode,
  DEFAULT_VISUALIZER_STYLE_TUNINGS,
  type VisualizerStyle,
  type VisualizerStyleTuning,
  type VisualizerStyleTunings,
} from "./styles";

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

      const card = document.createElement("div");
      card.className = "settings-card";
      container.appendChild(card);

      const toggleLabel = document.createElement("label");
      toggleLabel.className = "toggle-row";

      const toggleText = document.createElement("span");
      toggleText.textContent = "Enable audio visualizer";
      toggleLabel.appendChild(toggleText);

      const toggle = document.createElement("input");
      toggle.type = "checkbox";
      toggle.disabled = true;
      toggleLabel.appendChild(toggle);

      card.appendChild(toggleLabel);

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
      card.appendChild(styleLabel);

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
        { value: "player-bar-only", text: "Thumbnail Only" },
      ];

      for (const opt of targetOptions) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        targetSelect.appendChild(option);
      }

      targetLabel.appendChild(targetSelect);
      card.appendChild(targetLabel);

      const colorModeLabel = document.createElement("label");
      colorModeLabel.className = "toggle-row";

      const colorModeText = document.createElement("span");
      colorModeText.textContent = "Color mode";
      colorModeLabel.appendChild(colorModeText);

      const colorModeSelect = document.createElement("select");
      colorModeSelect.disabled = true;
      const colorModeOptions = [
        { value: "white", text: "White" },
        { value: "artwork-adaptive", text: "Artwork Adaptive" },
        { value: "monochrome-dim", text: "Monochrome Dim" },
      ];
      for (const opt of colorModeOptions) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.text;
        colorModeSelect.appendChild(option);
      }
      colorModeLabel.appendChild(colorModeSelect);
      card.appendChild(colorModeLabel);

      const autoModeHint = document.createElement("div");
      autoModeHint.className = "shortcuts-hint shortcuts-hint--spaced";
      autoModeHint.innerHTML =
        "<strong>Tip:</strong> <strong>Auto</strong> mode shows the visualizer on the most relevant visible surface: PiP first, then Song Art, then Thumbnail.";
      container.appendChild(autoModeHint);

      const tuningCard = document.createElement("div");
      tuningCard.className = "settings-card";
      container.appendChild(tuningCard);

      const tuningHeading = document.createElement("h3");
      tuningHeading.textContent = "Current Style Tuning";
      tuningCard.appendChild(tuningHeading);

      const intensityControl = createRangeControl(
        tuningCard,
        "Intensity",
        "25",
        "200",
        "100",
      );
      const thicknessControl = createRangeControl(
        tuningCard,
        "Thickness",
        "50",
        "250",
        "100",
      );
      const opacityControl = createRangeControl(
        tuningCard,
        "Opacity",
        "10",
        "100",
        "100",
      );

      let styleTunings: VisualizerStyleTunings = {
        bars: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.bars },
        waveform: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.waveform },
        circular: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.circular },
      };

      const refreshTuningControls = () => {
        const currentStyle = select.value as VisualizerStyle;
        const tuning = styleTunings[currentStyle];
        intensityControl.range.value = String(
          Math.round(tuning.intensity * 100),
        );
        thicknessControl.range.value = String(
          Math.round(tuning.thickness * 100),
        );
        opacityControl.range.value = String(Math.round(tuning.opacity * 100));
        intensityControl.value.textContent = `${intensityControl.range.value}%`;
        thicknessControl.value.textContent = `${thicknessControl.range.value}%`;
        opacityControl.value.textContent = `${opacityControl.range.value}%`;
      };

      const setTuningControlsEnabled = (enabled: boolean) => {
        intensityControl.range.disabled = !enabled;
        thicknessControl.range.disabled = !enabled;
        opacityControl.range.disabled = !enabled;
      };

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
            refreshTuningControls();
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

      chrome.runtime.sendMessage(
        { type: "get-audio-visualizer-style-tunings" },
        (response: { ok: boolean; data?: VisualizerStyleTunings }) => {
          if (response?.ok && response.data) {
            styleTunings = {
              bars: { ...response.data.bars },
              waveform: { ...response.data.waveform },
              circular: { ...response.data.circular },
            };
            setTuningControlsEnabled(true);
            refreshTuningControls();
          }
        },
      );

      chrome.runtime.sendMessage(
        { type: "get-audio-visualizer-color-mode" },
        (response: { ok: boolean; data?: VisualizerColorMode }) => {
          if (response?.ok && response.data) {
            colorModeSelect.value = response.data;
            colorModeSelect.disabled = false;
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
        refreshTuningControls();
      });

      targetSelect.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-target",
          target: targetSelect.value,
        });
      });

      colorModeSelect.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-color-mode",
          mode: colorModeSelect.value,
        });
      });

      const onTuningInput = () => {
        const style = select.value as VisualizerStyle;
        const tuning: VisualizerStyleTuning = {
          intensity: Number(intensityControl.range.value) / 100,
          thickness: Number(thicknessControl.range.value) / 100,
          opacity: Number(opacityControl.range.value) / 100,
        };
        styleTunings[style] = tuning;
        refreshTuningControls();
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-style-tuning",
          style,
          tuning,
        });
      };

      intensityControl.range.addEventListener("input", onTuningInput);
      thicknessControl.range.addEventListener("input", onTuningInput);
      opacityControl.range.addEventListener("input", onTuningInput);
    },
  };
}

function createRangeControl(
  parent: HTMLElement,
  labelText: string,
  min: string,
  max: string,
  value: string,
): {
  range: HTMLInputElement;
  value: HTMLElement;
} {
  const row = document.createElement("label");
  row.className = "toggle-row";

  const label = document.createElement("span");
  label.textContent = labelText;
  row.appendChild(label);

  const range = document.createElement("input");
  range.type = "range";
  range.min = min;
  range.max = max;
  range.value = value;
  range.disabled = true;
  row.appendChild(range);

  const valueText = document.createElement("span");
  valueText.textContent = `${value}%`;
  row.appendChild(valueText);

  parent.appendChild(row);
  return { range, value: valueText };
}
