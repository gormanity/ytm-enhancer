import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readScript(): string {
  return readFileSync(
    resolve(process.cwd(), "scripts/dev-build-tip.mjs"),
    "utf-8",
  );
}

describe("dev build tip script", () => {
  it("finds heads inside the current stack only", () => {
    const source = readScript();

    expect(source).toContain('"heads(@:: & trunk()..)"');
    expect(source).not.toContain('"heads(trunk()..)"');
  });
});
