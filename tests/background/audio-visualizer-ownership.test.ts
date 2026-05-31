import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  resolve(process.cwd(), "src/background/index.ts"),
  "utf-8",
);

describe("audio visualizer background ownership", () => {
  it("keeps restored content sync inside the Audio Visualizer module", () => {
    expect(backgroundSource).not.toContain("broadcastVisualizerSettings");
    expect(backgroundSource).not.toContain(
      '"set-audio-visualizer-style-tunings"',
    );
  });
});
