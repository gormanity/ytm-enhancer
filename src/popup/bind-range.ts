import { createRangeSlider } from "@/ui/range-slider";

/**
 * Wire a range slider to background messaging.
 *
 * Creates a `RangeSliderComponent` from the shared UI library,
 * injects it into the slot identified by `dataRole`, sends a
 * GET message to fetch the initial value, enables the slider
 * on success, and sends a SET message on every input event.
 *
 * Optionally syncs a paired number input and/or a display
 * element. The filled-track gradient is always active.
 */
export function bindRange(
  container: HTMLElement,
  dataRole: string,
  options: {
    getType: string;
    setType: string;
    /** Key name for the value in the SET message. Default: `"value"`. */
    setKey?: string;
    /** Minimum value. Default: read from slot's `data-min` or `0`. */
    min?: number;
    /** Maximum value. Default: read from slot's `data-max` or `100`. */
    max?: number;
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
    /** Called after GET succeeds and the slider is enabled. */
    onLoaded?: (range: HTMLInputElement) => void;
  },
): void {
  const slot = container.querySelector<HTMLElement>(
    `[data-role="${dataRole}"]`,
  );
  if (!slot) return;

  const min = options.min ?? (Number(slot.dataset.min) || 0);
  const max = options.max ?? (Number(slot.dataset.max) || 100);

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

  const sendValue = (val: number) => {
    chrome.runtime.sendMessage({
      type: options.setType,
      [setKey]: transformValue(val),
    });
  };

  const syncDisplay = (val: number) => {
    if (numberInput) {
      numberInput.value = String(val);
    }
    if (display) {
      display.textContent = formatDisplay(val);
    }
  };

  const slider = createRangeSlider({
    min,
    max,
    onInput(val) {
      syncDisplay(val);
      sendValue(val);
    },
  });

  slider.setEnabled(false);
  slot.replaceChildren(slider.element);

  chrome.runtime.sendMessage(
    { type: options.getType },
    (response: { ok: boolean; data?: unknown } | null) => {
      if (response?.ok) {
        const val = parseData(response.data);
        slider.setValue(val);
        slider.setEnabled(true);
        syncDisplay(val);
        if (numberInput) {
          numberInput.disabled = false;
        }
        options.onLoaded?.(slider.element);
      }
    },
  );

  if (numberInput) {
    numberInput.addEventListener("change", () => {
      const val = Math.max(min, Math.min(max, Number(numberInput.value)));
      numberInput.value = String(val);
      slider.setValue(val);
      if (display) {
        display.textContent = formatDisplay(val);
      }
      sendValue(val);
    });
  }
}
