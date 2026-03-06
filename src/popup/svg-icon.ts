/**
 * Parse inline SVG markup once into a clonable template element.
 */
export function createSvgIconTemplate(svgMarkup: string): SVGElement | null {
  const template = document.createElement("template");
  template.innerHTML = svgMarkup.trim();
  const root = template.content.firstElementChild;
  return root instanceof SVGElement ? root : null;
}

/**
 * Replace a button's icon contents with a clone of a pre-parsed SVG template.
 */
export function setButtonSvgIcon(
  button: HTMLButtonElement,
  iconTemplate: SVGElement | null,
): void {
  if (!iconTemplate) return;
  button.replaceChildren(iconTemplate.cloneNode(true));
}
