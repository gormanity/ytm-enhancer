import { afterEach, describe, expect, it } from "vitest";
import {
  dismissYtmTooltips,
  installYtmTooltipDismissal,
} from "@/content/ytm-tooltip-dismissal";

function createStartPlaybackTooltip(): HTMLElement {
  const tooltip = document.createElement("tp-yt-paper-tooltip");
  tooltip.textContent = "Start playback";
  tooltip.setAttribute("aria-hidden", "false");
  tooltip.style.display = "block";
  document.body.appendChild(tooltip);
  return tooltip;
}

describe("YTM tooltip dismissal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("hides visible YTM playback tooltips", () => {
    const tooltip = createStartPlaybackTooltip();

    dismissYtmTooltips();

    expect(tooltip.getAttribute("aria-hidden")).toBe("true");
    expect(tooltip.hasAttribute("visible")).toBe(false);
    expect(tooltip.style.display).toBe("block");
    expect(tooltip.style.opacity).toBe("");
    expect(tooltip.style.pointerEvents).toBe("");
  });

  it("dismisses playback tooltips on any document click", () => {
    const cleanup = installYtmTooltipDismissal();
    const tooltip = createStartPlaybackTooltip();
    const button = document.createElement("button");
    document.body.appendChild(button);

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(tooltip.getAttribute("aria-hidden")).toBe("true");
    cleanup();
  });

  it("dismisses playback tooltips when media playback starts", () => {
    const cleanup = installYtmTooltipDismissal();
    const tooltip = createStartPlaybackTooltip();
    const video = document.createElement("video");
    document.body.appendChild(video);

    video.dispatchEvent(new Event("play"));

    expect(tooltip.getAttribute("aria-hidden")).toBe("true");
    cleanup();
  });
});
