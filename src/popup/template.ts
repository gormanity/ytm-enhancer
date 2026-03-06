/** Render static template markup into a popup view container. */
export function renderPopupTemplate(
  container: HTMLElement,
  html: string,
): void {
  container.innerHTML = "";
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  container.appendChild(template.content.cloneNode(true));
}
