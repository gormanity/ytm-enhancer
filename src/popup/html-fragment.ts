/**
 * Parse static HTML into a document fragment.
 */
export function parseHtmlFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.cloneNode(true) as DocumentFragment;
}

/**
 * Parse static HTML and return its first element node, if any.
 */
export function parseFirstElement(html: string): Element | null {
  const fragment = parseHtmlFragment(html);
  return fragment.firstElementChild;
}
