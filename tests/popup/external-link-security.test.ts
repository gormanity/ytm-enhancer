import { describe, expect, it } from "vitest";
import connectedAppsPopupHtml from "@/core/connectors/popup.html?raw";
import aboutPopupHtml from "@/modules/about/popup.html?raw";

const popupTemplates = [
  ["About", aboutPopupHtml],
  ["Connected Apps", connectedAppsPopupHtml],
] as const;

describe("popup external links", () => {
  it.each(popupTemplates)(
    "%s target=_blank links should not expose window.opener",
    (_name, html) => {
      const container = document.createElement("div");
      container.innerHTML = html;

      for (const link of container.querySelectorAll<HTMLAnchorElement>(
        'a[target="_blank"]',
      )) {
        expect(link.relList.contains("noreferrer")).toBe(true);
      }
    },
  );
});
