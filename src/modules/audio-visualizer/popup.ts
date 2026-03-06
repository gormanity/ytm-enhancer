import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import {
  type VisualizerColorMode,
  DEFAULT_VISUALIZER_STYLE_TUNING,
  DEFAULT_VISUALIZER_STYLE_TUNINGS,
  type VisualizerStyle,
  type VisualizerStyleTuning,
  type VisualizerStyleTunings,
} from "./styles";
import templateHtml from "./popup.html?raw";

/** Create the audio visualizer settings popup view. */
export function createAudioVisualizerPopupView(): PopupView {
  return {
    id: "audio-visualizer-settings",
    label: "Audio Visualizer",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      const toggle = container.querySelector<HTMLInputElement>(
        '[data-role="audio-visualizer-enabled-toggle"]',
      );
      const select = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-style-select"]',
      );
      const targetSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-target-select"]',
      );
      const colorModeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-color-mode-select"]',
      );
      const intensityRange = container.querySelector<HTMLInputElement>(
        '[data-role="audio-visualizer-intensity-range"]',
      );
      const intensityValue = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-intensity-value"]',
      );
      const thicknessRange = container.querySelector<HTMLInputElement>(
        '[data-role="audio-visualizer-thickness-range"]',
      );
      const thicknessValue = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-thickness-value"]',
      );
      const opacityRange = container.querySelector<HTMLInputElement>(
        '[data-role="audio-visualizer-opacity-range"]',
      );
      const opacityValue = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-opacity-value"]',
      );
      if (
        !toggle ||
        !select ||
        !targetSelect ||
        !colorModeSelect ||
        !intensityRange ||
        !intensityValue ||
        !thicknessRange ||
        !thicknessValue ||
        !opacityRange ||
        !opacityValue
      ) {
        return;
      }

      toggle.disabled = true;
      select.disabled = true;
      targetSelect.disabled = true;
      colorModeSelect.disabled = true;
      intensityRange.disabled = true;
      thicknessRange.disabled = true;
      opacityRange.disabled = true;

      const intensityControl = { range: intensityRange, value: intensityValue };
      const thicknessControl = { range: thicknessRange, value: thicknessValue };
      const opacityControl = { range: opacityRange, value: opacityValue };

      let styleTunings: VisualizerStyleTunings = {
        bars: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.bars },
        waveform: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.waveform },
        circular: { ...DEFAULT_VISUALIZER_STYLE_TUNINGS.circular },
      };

      const normalizeStyleTuning = (
        tuning: Partial<VisualizerStyleTuning> | undefined,
      ): VisualizerStyleTuning => ({
        intensity:
          typeof tuning?.intensity === "number"
            ? tuning.intensity
            : DEFAULT_VISUALIZER_STYLE_TUNING.intensity,
        thickness:
          typeof tuning?.thickness === "number"
            ? tuning.thickness
            : DEFAULT_VISUALIZER_STYLE_TUNING.thickness,
        opacity:
          typeof tuning?.opacity === "number"
            ? tuning.opacity
            : DEFAULT_VISUALIZER_STYLE_TUNING.opacity,
        colorMode:
          tuning?.colorMode === "white" ||
          tuning?.colorMode === "artwork-adaptive" ||
          tuning?.colorMode === "monochrome-dim"
            ? tuning.colorMode
            : "white",
      });

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
        colorModeSelect.value = tuning.colorMode;
        intensityControl.value.textContent = `${intensityControl.range.value}%`;
        thicknessControl.value.textContent = `${thicknessControl.range.value}%`;
        opacityControl.value.textContent = `${opacityControl.range.value}%`;
      };

      const setTuningControlsEnabled = (enabled: boolean) => {
        colorModeSelect.disabled = !enabled;
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
        (response: {
          ok: boolean;
          data?: Partial<
            Record<VisualizerStyle, Partial<VisualizerStyleTuning>>
          >;
        }) => {
          if (response?.ok && response.data) {
            styleTunings = {
              bars: normalizeStyleTuning(response.data.bars),
              waveform: normalizeStyleTuning(response.data.waveform),
              circular: normalizeStyleTuning(response.data.circular),
            };
            setTuningControlsEnabled(true);
            refreshTuningControls();
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
        const style = select.value as VisualizerStyle;
        styleTunings[style] = {
          ...styleTunings[style],
          colorMode: colorModeSelect.value as VisualizerColorMode,
        };
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
          colorMode: styleTunings[style].colorMode,
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
