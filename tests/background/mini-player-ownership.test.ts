import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const backgroundSource = readFileSync(
  resolve(process.cwd(), "src/background/index.ts"),
  "utf-8",
);

describe("mini player background ownership", () => {
  it("keeps PiP open state inside the Mini Player module", () => {
    expect(backgroundSource).not.toContain("pipOpenTabIds");
    expect(backgroundSource).not.toContain('handler.on("pip-open-state"');
    expect(backgroundSource).toContain("miniPlayer.hasOpenPipWindow()");
  });
});
