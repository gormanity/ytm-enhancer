import { describe, it, expect } from "vitest";
import { AudioVisualizerModule } from "@/modules/audio-visualizer";
import type { FeatureModule } from "@/core/types";

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
    mod.setColorMode("monochrome-dim");
    expect(mod.getColorMode()).toBe("monochrome-dim");
  });

  it("should return popup views", () => {
    const mod = new AudioVisualizerModule();
    const views = mod.getPopupViews!();
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("audio-visualizer-settings");
    expect(views[0].label).toBe("Audio Visualizer");
  });

  it("should provide per-style tunings with defaults", () => {
    const mod = new AudioVisualizerModule();
    expect(mod.getStyleTunings()).toEqual({
      bars: { intensity: 1, thickness: 1, opacity: 1 },
      waveform: { intensity: 1, thickness: 1, opacity: 1 },
      circular: { intensity: 1, thickness: 1, opacity: 1 },
    });
  });

  it("should set a tuning for one style", () => {
    const mod = new AudioVisualizerModule();
    mod.setStyleTuning("waveform", {
      intensity: 1.5,
      thickness: 1.2,
      opacity: 0.8,
    });
    expect(mod.getStyleTunings().waveform).toEqual({
      intensity: 1.5,
      thickness: 1.2,
      opacity: 0.8,
    });
    expect(mod.getStyleTunings().bars).toEqual({
      intensity: 1,
      thickness: 1,
      opacity: 1,
    });
  });

  it("should init and destroy without error", () => {
    const mod = new AudioVisualizerModule();
    expect(() => mod.init()).not.toThrow();
    expect(() => mod.destroy()).not.toThrow();
  });
});
