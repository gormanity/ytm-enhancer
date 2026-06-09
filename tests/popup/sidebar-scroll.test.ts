import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const popupCss = readFileSync(
  resolve(process.cwd(), "src/popup/index.css"),
  "utf-8",
);

describe("popup sidebar scrolling", () => {
  it("allows the module list to scroll without a visible scrollbar", () => {
    expect(popupCss).toMatch(/#nav-list\s*\{[^}]*overflow-y:\s*auto;/s);
    expect(popupCss).toMatch(/#nav-list\s*\{[^}]*scrollbar-width:\s*none;/s);
    expect(popupCss).toMatch(
      /#nav-list::-webkit-scrollbar\s*\{[^}]*display:\s*none;/s,
    );
  });
});
