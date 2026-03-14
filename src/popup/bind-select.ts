/**
 * Wire a select element to background messaging.
 *
 * The select starts disabled, sends a GET message to fetch the
 * initial value, enables itself on success (removing any
 * placeholder option), and sends a SET message on every change.
 */
export function bindSelect(
  container: HTMLElement,
  dataRole: string,
  options: {
    getType: string;
    setType: string;
    /** Key name for the value in the SET message. Default: `"value"`. */
    setKey?: string;
    /** Extract the select value from `response.data`. Default: `String(data)`. */
    parseData?: (data: unknown) => string;
    /** Transform `select.value` for the SET payload. Default: identity. */
    transformValue?: (value: string) => unknown;
    /** Called after GET succeeds and the select is enabled. */
    onLoaded?: (select: HTMLSelectElement) => void;
  },
): void {
  const select = container.querySelector<HTMLSelectElement>(
    `[data-role="${dataRole}"]`,
  );
  if (!select) return;
  select.disabled = true;

  const placeholder =
    select.querySelector<HTMLOptionElement>('option[value=""]');

  chrome.runtime.sendMessage(
    { type: options.getType },
    (response: { ok: boolean; data?: unknown } | null) => {
      if (response?.ok) {
        const parseData = options.parseData ?? String;
        select.value = parseData(response.data);
        select.disabled = false;
        placeholder?.remove();
        options.onLoaded?.(select);
      }
    },
  );

  const setKey = options.setKey ?? "value";
  const transformValue = options.transformValue ?? ((v: string) => v);

  select.addEventListener("change", () => {
    if (select.value) {
      chrome.runtime.sendMessage({
        type: options.setType,
        [setKey]: transformValue(select.value),
      });
    }
  });
}
