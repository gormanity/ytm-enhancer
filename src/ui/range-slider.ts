/**
 * Shared range slider component.
 *
 * Creates a three-part inline control from the shared HTML
 * template: label | adjustable slider with thumb | numeric
 * value with unit. The filled-track gradient updates
 * automatically on user interaction and programmatic changes.
 *
 * Place multiple range sliders inside a `.range-slider-grid`
 * container so their columns align via CSS subgrid.
 *
 * Themed via CSS custom properties (`--range-fill`, `--range-bg`,
 * `--range-thumb-color`, etc.).
 */

import templateHtml from "./range-slider.html?raw";

/** A fully encapsulated range slider component. */
export interface RangeSliderComponent {
  /** The row element — append this to the DOM. */
  element: HTMLElement;
  /** Get the current numeric value. */
  getValue(): number;
  /** Set the value and update the filled-track gradient. */
  setValue(value: number): void;
  /** Enable or disable the slider and number input. */
  setEnabled(enabled: boolean): void;
  /** Remove event listeners. */
  destroy(): void;
}

export interface CreateRangeSliderOptions {
  /** Text label displayed before the slider. */
  label: string;
  /** Minimum value. Default: `0`. */
  min?: number;
  /** Maximum value. Default: `100`. */
  max?: number;
  /** Initial value. Default: `0`. */
  value?: number;
  /** Step size. When omitted, uses the browser default (`1`). */
  step?: number;
  /** Unit suffix displayed after the number (e.g., `"%"`). Default: none. */
  unit?: string;
  /** Called on every user input event (slider drag or number edit). */
  onInput?: (value: number) => void;
}

/**
 * Create a range slider from the shared HTML template.
 *
 * The returned element contains a label, a range input with
 * auto-updating filled-track gradient, and a number input
 * with optional unit suffix. Slider and number input stay
 * in bidirectional sync.
 */
export function createRangeSlider(
  options: CreateRangeSliderOptions,
): RangeSliderComponent {
  const parsed = new DOMParser().parseFromString(
    templateHtml.trim(),
    "text/html",
  );
  const row = parsed.body.firstElementChild!.cloneNode(true) as HTMLElement;

  const labelEl = row.querySelector<HTMLElement>(".range-slider-label")!;
  const range = row.querySelector<HTMLInputElement>(".range-slider")!;
  const numberInput = row.querySelector<HTMLInputElement>(
    ".range-slider-number",
  )!;
  const unitEl = row.querySelector<HTMLElement>(".range-slider-unit")!;

  const min = options.min ?? 0;
  const max = options.max ?? 100;

  labelEl.textContent = options.label;
  range.min = String(min);
  range.max = String(max);
  numberInput.min = String(min);
  numberInput.max = String(max);
  if (options.step != null) {
    range.step = String(options.step);
    numberInput.step = String(options.step);
  }
  if (options.value != null) {
    range.value = String(options.value);
    numberInput.value = String(options.value);
  }
  if (options.unit) {
    unitEl.textContent = options.unit;
  }

  const updateFill = () => {
    const val = Number(range.value);
    const pct = ((val - min) / (max - min)) * 100;
    range.style.background = `linear-gradient(to right, var(--range-fill, var(--accent-color)) 0%, var(--range-fill, var(--accent-color)) ${pct}%, var(--range-bg, #3f3f3f) ${pct}%, var(--range-bg, #3f3f3f) 100%)`;
  };

  const syncNumberFromRange = () => {
    numberInput.value = range.value;
    updateFill();
  };

  const onRangeInput = () => {
    syncNumberFromRange();
    options.onInput?.(Number(range.value));
  };

  const onNumberChange = () => {
    const val = Math.max(min, Math.min(max, Number(numberInput.value)));
    numberInput.value = String(val);
    range.value = String(val);
    updateFill();
    options.onInput?.(val);
  };

  range.addEventListener("input", onRangeInput);
  numberInput.addEventListener("change", onNumberChange);
  updateFill();

  return {
    element: row,
    getValue: () => Number(range.value),
    setValue(value: number) {
      range.value = String(value);
      numberInput.value = String(value);
      updateFill();
    },
    setEnabled(enabled: boolean) {
      range.disabled = !enabled;
      numberInput.disabled = !enabled;
    },
    destroy() {
      range.removeEventListener("input", onRangeInput);
      numberInput.removeEventListener("change", onNumberChange);
    },
  };
}
