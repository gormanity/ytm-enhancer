import { describe, it, expect } from "vitest";
import { AudioVisualizerModule } from "@/modules/audio-visualizer";
import type { FeatureModule } from "@/core/types";
import { createTestModuleContext } from "../../helpers/module-context";

describe("AudioVisualizerModule", () => {
  it("should implement FeatureModule interface", () => {
    const mod: FeatureModule = new AudioVisualizerModule();
    expect(mod.id).toBe("audio-visualizer");
    expect(mod.name).toBe("Audio Visualizer");
    expect(mod.description).toBeDefined();
  });

  it("should be enabled by default", () => {
    const mod = new AudioVisualizerModule();
    expect(mod.isEnabled()).toBe(true);
  });

  it("should toggle enabled state", () => {
    const mod = new AudioVisualizerModule();
    mod.setEnabled(false);
    expect(mod.isEnabled()).toBe(false);
    mod.setEnabled(true);
    expect(mod.isEnabled()).toBe(true);
  });

  it("should default to bars style", () => {
    const mod = new AudioVisualizerModule();
    expect(mod.getStyle()).toBe("bars");
  });

  it("should change style", () => {
    const mod = new AudioVisualizerModule();
    mod.setStyle("waveform");
    expect(mod.getStyle()).toBe("waveform");
    mod.setStyle("circular");
    expect(mod.getStyle()).toBe("circular");
  });

  it("should default to auto target", () => {
    const mod = new AudioVisualizerModule();
    expect(mod.getTarget()).toBe("auto");
  });

  it("should default to white color mode", () => {
    const mod = new AudioVisualizerModule();
    expect(mod.getColorMode()).toBe("white");
  });

  it("should change target", () => {
    const mod = new AudioVisualizerModule();
    mod.setTarget("pip-only");
    expect(mod.getTarget()).toBe("pip-only");
    mod.setTarget("all");
    expect(mod.getTarget()).toBe("all");
  });

  it("should change color mode", () => {
    const mod = new AudioVisualizerModule();
    mod.setColorMode("artwork-adaptive");
    expect(mod.getColorMode()).toBe("artwork-adaptive");
    mod.setStyle("waveform");
    expect(mod.getColorMode()).toBe("white");
    mod.setColorMode("monochrome-dim");
    expect(mod.getColorMode()).toBe("monochrome-dim");
  });

  it("should return popup views", () => {
    const mod = new AudioVisualizerModule();
    const views = mod.getPopupViews!(createTestModuleContext());
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("audio-visualizer-settings");
    expect(views[0].label).toBe("Audio Visualizer");
  });

  it("should provide per-style tunings with defaults", () => {
    const mod = new AudioVisualizerModule();
    expect(mod.getStyleTunings()).toEqual({
      bars: { intensity: 1, thickness: 1, opacity: 1, colorMode: "white" },
      waveform: { intensity: 1, thickness: 1, opacity: 1, colorMode: "white" },
      circular: { intensity: 1, thickness: 1, opacity: 1, colorMode: "white" },
    });
  });

  it("should set a tuning for one style", () => {
    const mod = new AudioVisualizerModule();
    mod.setStyleTuning("waveform", {
      intensity: 1.5,
      thickness: 1.2,
      opacity: 0.8,
      colorMode: "monochrome-dim",
    });
    expect(mod.getStyleTunings().waveform).toEqual({
      intensity: 1.5,
      thickness: 1.2,
      opacity: 0.8,
      colorMode: "monochrome-dim",
    });
    expect(mod.getStyleTunings().bars).toEqual({
      intensity: 1,
      thickness: 1,
      opacity: 1,
      colorMode: "white",
    });
  });

  it("should init and destroy without error", () => {
    const mod = new AudioVisualizerModule();
    expect(() => mod.init()).not.toThrow();
    expect(() => mod.destroy()).not.toThrow();
  });

  it("should sync restored settings through the YTM runtime API", async () => {
    const context = createTestModuleContext();
    const mod = new AudioVisualizerModule();
    mod.setEnabled(false);
    mod.setStyle("waveform");
    mod.setTarget("pip-only");
    mod.setStyleTuning("waveform", {
      intensity: 1.5,
      thickness: 1.25,
      opacity: 0.75,
      colorMode: "artwork-adaptive",
    });

    await mod.syncContentState!(context);

    expect(context.ytm.broadcast).toHaveBeenNthCalledWith(1, {
      type: "set-audio-visualizer-enabled",
      enabled: false,
    });
    expect(context.ytm.broadcast).toHaveBeenNthCalledWith(2, {
      type: "set-audio-visualizer-style",
      style: "waveform",
    });
    expect(context.ytm.broadcast).toHaveBeenNthCalledWith(3, {
      type: "set-audio-visualizer-target",
      target: "pip-only",
    });
    expect(context.ytm.broadcast).toHaveBeenNthCalledWith(4, {
      type: "set-audio-visualizer-style-tunings",
      tunings: mod.getStyleTunings(),
    });
    expect(context.ytm.broadcast).toHaveBeenNthCalledWith(5, {
      type: "set-audio-visualizer-color-mode",
      mode: "artwork-adaptive",
    });
  });
});
