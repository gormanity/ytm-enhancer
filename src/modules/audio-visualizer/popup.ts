import type { ModuleContext, PopupView } from "@/core/types";
import { renderPopupTemplate } from "@/popup/template";
import { bindModuleToggle } from "@/popup/module-ui";
import { createRangeSlider } from "@/ui/range-slider";
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
export function createAudioVisualizerPopupView(
  context: ModuleContext,
): PopupView {
  return {
    id: "audio-visualizer-settings",
    label: "Audio Visualizer",
    render(container: HTMLElement) {
      renderPopupTemplate(container, templateHtml);

      bindModuleToggle(container, "audio-visualizer-enabled-toggle", {
        get: () =>
          context.runtime.request<boolean>({
            type: "get-audio-visualizer-enabled",
          }),
        set: (enabled) =>
          context.runtime.command({
            type: "set-audio-visualizer-enabled",
            enabled,
          }),
      });

      const styleSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-style-select"]',
      );
      const targetSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-target-select"]',
      );
      const colorModeSelect = container.querySelector<HTMLSelectElement>(
        '[data-role="audio-visualizer-color-mode-select"]',
      );
      const tuningGrid = container.querySelector<HTMLElement>(
        '[data-role="audio-visualizer-tuning-sliders"]',
      );
      if (!styleSelect || !targetSelect || !colorModeSelect || !tuningGrid) {
        return;
      }

      styleSelect.disabled = true;
      targetSelect.disabled = true;
      colorModeSelect.disabled = true;

      const intensitySlider = createRangeSlider({
        label: "Intensity",
        min: 25,
        max: 200,
        value: 100,
        unit: "%",
        onInput: onTuningInput,
      });
      const thicknessSlider = createRangeSlider({
        label: "Thickness",
        min: 50,
        max: 250,
        value: 100,
        unit: "%",
        onInput: onTuningInput,
      });
      const opacitySlider = createRangeSlider({
        label: "Opacity",
        min: 10,
        max: 100,
        value: 100,
        unit: "%",
        onInput: onTuningInput,
      });

      intensitySlider.setEnabled(false);
      thicknessSlider.setEnabled(false);
      opacitySlider.setEnabled(false);

      tuningGrid.appendChild(intensitySlider.element);
      tuningGrid.appendChild(thicknessSlider.element);
      tuningGrid.appendChild(opacitySlider.element);

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
        intensitySlider.setValue(Math.round(tuning.intensity * 100));
        thicknessSlider.setValue(Math.round(tuning.thickness * 100));
        opacitySlider.setValue(Math.round(tuning.opacity * 100));
        colorModeSelect.value = tuning.colorMode;
      };

      const setTuningControlsEnabled = (enabled: boolean) => {
        colorModeSelect.disabled = !enabled;
        intensitySlider.setEnabled(enabled);
        thicknessSlider.setEnabled(enabled);
        opacitySlider.setEnabled(enabled);
      };

      function onTuningInput() {
        const style = styleSelect!.value as VisualizerStyle;
        const tuning: VisualizerStyleTuning = {
          intensity: intensitySlider.getValue() / 100,
          thickness: thicknessSlider.getValue() / 100,
          opacity: opacitySlider.getValue() / 100,
          colorMode: styleTunings[style].colorMode,
        };
        styleTunings[style] = tuning;
        void context.runtime.command({
          type: "set-audio-visualizer-style-tuning",
          style,
          tuning,
        });
      }

      const loadFromSnapshot = (snapshot: {
        style: VisualizerStyle;
        target: string;
        tunings: Partial<
          Record<VisualizerStyle, Partial<VisualizerStyleTuning>>
        >;
      }) => {
        styleSelect.value = snapshot.style;
        targetSelect.value = snapshot.target;
        styleTunings = {
          bars: normalizeStyleTuning(snapshot.tunings.bars),
          waveform: normalizeStyleTuning(snapshot.tunings.waveform),
          circular: normalizeStyleTuning(snapshot.tunings.circular),
        };
        styleSelect.disabled = false;
        targetSelect.disabled = false;
        setTuningControlsEnabled(true);
        refreshTuningControls();
      };

      void context.runtime
        .request<{
          style: VisualizerStyle;
          target: string;
          tunings: Partial<
            Record<VisualizerStyle, Partial<VisualizerStyleTuning>>
          >;
        }>({ type: "get-audio-visualizer-snapshot" })
        .then(loadFromSnapshot);

      styleSelect.addEventListener("change", () => {
        void context.runtime.command({
          type: "set-audio-visualizer-style",
          style: styleSelect.value,
        });
        refreshTuningControls();
      });

      targetSelect.addEventListener("change", () => {
        void context.runtime.command({
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
        void context.runtime.command({
          type: "set-audio-visualizer-color-mode",
          mode: colorModeSelect.value,
        });
      });
    },
  };
}
