import { describe, expect, it } from "vitest";
import { createAboutPopupView } from "@/modules/about/popup";

describe("createAboutPopupView", () => {
  it("should return a popup view with correct metadata", () => {
    const view = createAboutPopupView();
    expect(view.id).toBe("about");
    expect(view.label).toBe("About");
  });

  it("should render the expected static sections", () => {
    const view = createAboutPopupView();
    const container = document.createElement("div");
    view.render(container);

    expect(container.querySelector("h2")?.textContent).toBe("About");
    expect(container.textContent).toContain("YTM Enhancer");
    expect(container.textContent).toContain("Resources");
    expect(container.textContent).toContain("Extensions Stores");
    expect(container.querySelectorAll("a.about-link-row")).toHaveLength(2);
  });
});
