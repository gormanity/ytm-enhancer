import { createRangeSlider } from "@/ui/range-slider";

/**
 * Wire a range slider to background messaging.
 *
 * Creates a `RangeSliderComponent` from the shared UI library,
 * injects it into the slot identified by `dataRole`, sends a
 * GET message to fetch the initial value, enables the slider
 * on success, and sends a SET message on every input event.
 *
 * The component includes a label, slider with filled-track
 * gradient, and a number input — all inline.
 */
export function bindRange(
  container: HTMLElement,
  dataRole: string,
  options: {
    getType: string;
    setType: string;
    /** Text label displayed before the slider. */
    label: string;
    /** Key name for the value in the SET message. Default: `"value"`. */
    setKey?: string;
    /** Minimum value. Default: read from slot's `data-min` or `0`. */
    min?: number;
    /** Maximum value. Default: read from slot's `data-max` or `100`. */
    max?: number;
    /** Unit suffix displayed after the number (e.g., `"%"`). */
    unit?: string;
    /** Extract the range value from `response.data`. Default: `Number(data)`. */
    parseData?: (data: unknown) => number;
    /** Transform the range's numeric value for the SET payload. Default: identity. */
    transformValue?: (value: number) => unknown;
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
  const setKey = options.setKey ?? "value";
  const parseData = options.parseData ?? Number;
  const transformValue = options.transformValue ?? ((v: number) => v);

  const slider = createRangeSlider({
    label: options.label,
    min,
    max,
    unit: options.unit,
    onInput(val) {
      chrome.runtime.sendMessage({
        type: options.setType,
        [setKey]: transformValue(val),
      });
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
        options.onLoaded?.(
          slider.element.querySelector<HTMLInputElement>(".range-slider")!,
        );
      }
    },
  );
}
