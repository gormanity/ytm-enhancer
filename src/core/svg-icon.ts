const SVG_TEMPLATE_CACHE = new Map<string, SVGElement>();

function getCachedSvgTemplate(svgMarkup: string): SVGElement | null {
  const cached = SVG_TEMPLATE_CACHE.get(svgMarkup);
  if (cached) return cached;

  const doc = new DOMParser().parseFromString(
    svgMarkup.trim(),
    "image/svg+xml",
  );
  const parsed =
    doc.documentElement instanceof SVGElement ? doc.documentElement : null;
  if (!parsed) return null;

  SVG_TEMPLATE_CACHE.set(svgMarkup, parsed);
  return parsed;
}

function cloneSvgIcon(
  svgMarkup: string,
  targetDoc: Document,
): SVGElement | null {
  const parsed = getCachedSvgTemplate(svgMarkup);
  return parsed ? (targetDoc.importNode(parsed, true) as SVGElement) : null;
}

export function setElementSvgIcon(
  element: Element,
  svgMarkup: string,
  targetDoc: Document,
): void {
  const icon = cloneSvgIcon(svgMarkup, targetDoc);
  if (!icon) return;
  element.replaceChildren(icon);
}
