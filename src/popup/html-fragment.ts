/**
 * Parse static HTML into a document fragment.
 */
export function parseHtmlFragment(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(html.trim(), "text/html");
  const fragment = document.createDocumentFragment();

  for (const node of Array.from(doc.body.childNodes)) {
    fragment.appendChild(document.importNode(node, true));
  }

  return fragment;
}

/**
 * Parse static HTML and return its first element node, if any.
 */
export function parseFirstElement(html: string): Element | null {
  const fragment = parseHtmlFragment(html);
  return fragment.firstElementChild;
}
