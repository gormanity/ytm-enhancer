/**
 * Wire a range input to background messaging.
 *
 * The range starts disabled, sends a GET message to fetch the
 * initial value, enables itself on success, and sends a SET
 * message on every input event.
 *
 * Optionally syncs a paired number input and/or a display
 * element, and renders a filled-track gradient.
 */
export function bindRange(
  container: HTMLElement,
  dataRole: string,
  options: {
    getType: string;
    setType: string;
    /** Key name for the value in the SET message. Default: `"value"`. */
    setKey?: string;
    /** Extract the range value from `response.data`. Default: `Number(data)`. */
    parseData?: (data: unknown) => number;
    /** Transform the range's numeric value for the SET payload. Default: identity. */
    transformValue?: (value: number) => unknown;
    /**
     * `data-role` for a paired `<input type="number">`.
     * When provided, the number input syncs bidirectionally
     * with the range and is clamped to the range's min/max.
     */
    numberInputRole?: string;
    /**
     * `data-role` for a display element (e.g., `<span>`).
     * Updated with `formatDisplay(value)` on every change.
     */
    displayRole?: string;
    /** Format the value for the display element. Default: `String(value)`. */
    formatDisplay?: (value: number) => string;
    /** Render a filled-track gradient on the range. Default: `false`. */
    fillTrack?: boolean;
    /** Called after GET succeeds and the range is enabled. */
    onLoaded?: (range: HTMLInputElement) => void;
  },
): void {
  const range = container.querySelector<HTMLInputElement>(
    `[data-role="${dataRole}"]`,
  );
  if (!range) return;
  range.disabled = true;

  const numberInput = options.numberInputRole
    ? container.querySelector<HTMLInputElement>(
        `[data-role="${options.numberInputRole}"]`,
      )
    : null;
  const display = options.displayRole
    ? container.querySelector<HTMLElement>(
        `[data-role="${options.displayRole}"]`,
      )
    : null;

  if (numberInput) {
    numberInput.disabled = true;
  }

  const setKey = options.setKey ?? "value";
  const parseData = options.parseData ?? Number;
  const transformValue = options.transformValue ?? ((v: number) => v);
  const formatDisplay = options.formatDisplay ?? String;
  const fillTrack = options.fillTrack ?? false;

  const updateFill = () => {
    if (!fillTrack) return;
    const min = Number(range.min) || 0;
    const max = Number(range.max) || 100;
    const val = Number(range.value);
    const pct = ((val - min) / (max - min)) * 100;
    range.style.background = `linear-gradient(to right, var(--accent-color) 0%, var(--accent-color) ${pct}%, #3f3f3f ${pct}%, #3f3f3f 100%)`;
  };

  const syncFromRange = () => {
    const val = Number(range.value);
    if (numberInput) {
      numberInput.value = String(val);
    }
    if (display) {
      display.textContent = formatDisplay(val);
    }
    updateFill();
  };

  const sendValue = (val: number) => {
    chrome.runtime.sendMessage({
      type: options.setType,
      [setKey]: transformValue(val),
    });
  };

  chrome.runtime.sendMessage(
    { type: options.getType },
    (response: { ok: boolean; data?: unknown } | null) => {
      if (response?.ok) {
        const val = parseData(response.data);
        range.value = String(val);
        range.disabled = false;
        if (numberInput) {
          numberInput.value = String(val);
          numberInput.disabled = false;
        }
        if (display) {
          display.textContent = formatDisplay(val);
        }
        updateFill();
        options.onLoaded?.(range);
      }
    },
  );

  range.addEventListener("input", () => {
    syncFromRange();
    sendValue(Number(range.value));
  });

  if (numberInput) {
    numberInput.addEventListener("change", () => {
      const min = Number(range.min) || 0;
      const max = Number(range.max) || 100;
      const val = Math.max(min, Math.min(max, Number(numberInput.value)));
      numberInput.value = String(val);
      range.value = String(val);
      if (display) {
        display.textContent = formatDisplay(val);
      }
      updateFill();
      sendValue(val);
    });
  }
}
