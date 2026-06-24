import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript(): string {
  return readFileSync(resolve(process.cwd(), "scripts/package.mjs"), "utf-8");
}

describe("package script", () => {
  it("avoids shell interpolation for release zip creation", () => {
    const source = readScript();

    expect(source).not.toContain("execSync");
    expect(source).not.toContain("cat package.json");
    expect(source).toContain('execFileSync("zip"');
    expect(source).toContain('["-j", zipPath, ...files]');
  });
});
