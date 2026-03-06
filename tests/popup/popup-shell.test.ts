import { describe, expect, it } from "vitest";
import popupHtml from "../../src/popup/index.html?raw";

describe("popup shell html", () => {
  it("loads popup stylesheet", () => {
    expect(popupHtml).toContain('<link rel="stylesheet" href="./index.css" />');
  });

  it("contains expected shell anchors", () => {
    expect(popupHtml).toContain('<div id="app-shell">');
    expect(popupHtml).toContain('<aside id="sidebar">');
    expect(popupHtml).toContain('<nav id="nav-list"></nav>');
    expect(popupHtml).toContain('<main id="main-content">');
    expect(popupHtml).toContain('<div id="view-container"></div>');
  });
});
