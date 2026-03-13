/**
 * Wire a checkbox toggle to background messaging.
 *
 * The toggle starts disabled, sends a GET message to fetch the
 * initial state, enables itself on success, and sends a SET
 * message on every change.
 */
export function bindToggle(
  container: HTMLElement,
  dataRole: string,
  options: {
    getType: string;
    setType: string;
  },
): void {
  const toggle = container.querySelector<HTMLInputElement>(
    `[data-role="${dataRole}"]`,
  );
  if (!toggle) return;
  toggle.disabled = true;

  chrome.runtime.sendMessage(
    { type: options.getType },
    (response: { ok: boolean; data?: boolean } | null) => {
      if (response?.ok) {
        toggle.checked = response.data === true;
        toggle.disabled = false;
      }
    },
  );

  toggle.addEventListener("change", () => {
    chrome.runtime.sendMessage({
      type: options.setType,
      enabled: toggle.checked,
    });
  });
}
