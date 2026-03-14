import type { PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindToggle } from "@/popup/bind-toggle";
import {
  createRangeSlider,
  type RangeSliderComponent,
} from "@/ui/range-slider";
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

      bindToggle(container, "audio-visualizer-enabled-toggle", {
        getType: "get-audio-visualizer-enabled",
        setType: "set-audio-visualizer-enabled",
      });

      const select = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-style-select"]',
      );
      const targetSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-target-select"]',
      );
      const colorModeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-color-mode-select"]',
      );
      const intensitySlot = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-intensity-range"]',
      );
      const intensityValue = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-intensity-value"]',
      );
      const thicknessSlot = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-thickness-range"]',
      );
      const thicknessValue = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-thickness-value"]',
      );
      const opacitySlot = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-opacity-range"]',
      );
      const opacityValue = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-opacity-value"]',
      );
      if (
        !select ||
        !targetSelect ||
        !colorModeSelect ||
        !intensitySlot ||
        !intensityValue ||
        !thicknessSlot ||
        !thicknessValue ||
        !opacitySlot ||
        !opacityValue
      ) {
        return;
      }

      const styleSelect = select;
      styleSelect.disabled = true;
      targetSelect.disabled = true;
      colorModeSelect.disabled = true;

      const intensitySlider = createRangeSlider({
        min: 25,
        max: 200,
        value: 100,
        onInput: onTuningInput,
      });
      const thicknessSlider = createRangeSlider({
        min: 50,
        max: 250,
        value: 100,
        onInput: onTuningInput,
      });
      const opacitySlider = createRangeSlider({
        min: 10,
        max: 100,
        value: 100,
        onInput: onTuningInput,
      });

      intensitySlider.setEnabled(false);
      thicknessSlider.setEnabled(false);
      opacitySlider.setEnabled(false);

      intensitySlot.replaceChildren(intensitySlider.element);
      thicknessSlot.replaceChildren(thicknessSlider.element);
      opacitySlot.replaceChildren(opacitySlider.element);

      interface TuningControl {
        slider: RangeSliderComponent;
        display: HTMLElement;
      }

      const intensityControl: TuningControl = {
        slider: intensitySlider,
        display: intensityValue,
      };
      const thicknessControl: TuningControl = {
        slider: thicknessSlider,
        display: thicknessValue,
      };
      const opacityControl: TuningControl = {
        slider: opacitySlider,
        display: opacityValue,
      };

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
        const currentStyle = styleSelect.value as VisualizerStyle;
        const tuning = styleTunings[currentStyle];
        intensityControl.slider.setValue(Math.round(tuning.intensity * 100));
        thicknessControl.slider.setValue(Math.round(tuning.thickness * 100));
        opacityControl.slider.setValue(Math.round(tuning.opacity * 100));
        colorModeSelect.value = tuning.colorMode;
        intensityControl.display.textContent = `${intensityControl.slider.getValue()}%`;
        thicknessControl.display.textContent = `${thicknessControl.slider.getValue()}%`;
        opacityControl.display.textContent = `${opacityControl.slider.getValue()}%`;
      };

      const setTuningControlsEnabled = (enabled: boolean) => {
        colorModeSelect.disabled = !enabled;
        intensityControl.slider.setEnabled(enabled);
        thicknessControl.slider.setEnabled(enabled);
        opacityControl.slider.setEnabled(enabled);
      };

      function onTuningInput() {
        const style = styleSelect.value as VisualizerStyle;
        const tuning: VisualizerStyleTuning = {
          intensity: intensityControl.slider.getValue() / 100,
          thickness: thicknessControl.slider.getValue() / 100,
          opacity: opacityControl.slider.getValue() / 100,
          colorMode: styleTunings[style].colorMode,
        };
        styleTunings[style] = tuning;
        intensityControl.display.textContent = `${intensityControl.slider.getValue()}%`;
        thicknessControl.display.textContent = `${thicknessControl.slider.getValue()}%`;
        opacityControl.display.textContent = `${opacityControl.slider.getValue()}%`;
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-style-tuning",
          style,
          tuning,
        });
      }

      chrome.runtime.sendMessage(
        { type: "get-audio-visualizer-style" },
        (response: { ok: boolean; data?: string }) => {
          if (response?.ok && response.data) {
            styleSelect.value = response.data;
            styleSelect.disabled = false;
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

      styleSelect.addEventListener("change", () => {
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-style",
          style: styleSelect.value,
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
        const style = styleSelect.value as VisualizerStyle;
        styleTunings[style] = {
          ...styleTunings[style],
          colorMode: colorModeSelect.value as VisualizerColorMode,
        };
        chrome.runtime.sendMessage({
          type: "set-audio-visualizer-color-mode",
          mode: colorModeSelect.value,
        });
      });
    },
  };
}
