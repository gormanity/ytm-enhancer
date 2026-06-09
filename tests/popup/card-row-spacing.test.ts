import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const popupCss = readFileSync(
  resolve(process.cwd(), "src/popup/index.css"),
  "utf-8",
);

describe("popup card row spacing", () => {
  it("keeps a modest gap between labels and controls", () => {
    expect(popupCss).toMatch(/\.card-row\s*\{[^}]*gap:\s*12px;/s);
    expect(popupCss).toMatch(/\.card-row > span\s*\{[^}]*min-width:\s*0;/s);
  });
});
