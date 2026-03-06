import { parseHtmlFragment } from "./html-fragment";

/** Render static template markup into a popup view container. */
export function renderPopupTemplate(
  container: HTMLElement,
  html: string,
): void {
  container.replaceChildren(parseHtmlFragment(html));
}
