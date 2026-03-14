/**
 * Shared range slider component.
 *
 * Creates a themed `<input type="range">` from the shared HTML
 * template with an auto-updating filled-track gradient. Themed
 * via CSS custom properties (`--range-fill`, `--range-bg`, etc.).
 *
 * Usage mirrors `createProgressBar`: call the factory, append
 * the returned `element` to the DOM, and use `setValue()` to
 * update programmatically.
 */

import templateHtml from "./range-slider.html?raw";

/** A fully encapsulated range slider component. */
export interface RangeSliderComponent {
  /** The `<input type="range">` element — append this to the DOM. */
  element: HTMLInputElement;
  /** Get the current numeric value. */
  getValue(): number;
  /** Set the value and update the filled-track gradient. */
  setValue(value: number): void;
  /** Enable or disable the input. */
  setEnabled(enabled: boolean): void;
  /** Remove event listeners. */
  destroy(): void;
}

export interface CreateRangeSliderOptions {
  /** Minimum value. Default: `0`. */
  min?: number;
  /** Maximum value. Default: `100`. */
  max?: number;
  /** Initial value. Default: `0`. */
  value?: number;
  /** Step size. When omitted, uses the browser default (`1`). */
  step?: number;
  /** Called on every user `input` event with the current value. */
  onInput?: (value: number) => void;
}

/**
 * Create a range slider from the shared HTML template.
 *
 * The returned element has a filled-track gradient that
 * automatically stays in sync with the current value —
 * both on user interaction and programmatic `setValue()`.
 */
export function createRangeSlider(
  options?: CreateRangeSliderOptions,
): RangeSliderComponent {
  const parsed = new DOMParser().parseFromString(
    templateHtml.trim(),
    "text/html",
  );
  const input = parsed.body.firstElementChild!.cloneNode(
    true,
  ) as HTMLInputElement;

  if (options?.min != null) input.min = String(options.min);
  if (options?.max != null) input.max = String(options.max);
  if (options?.step != null) input.step = String(options.step);
  if (options?.value != null) input.value = String(options.value);

  const updateFill = () => {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const val = Number(input.value);
    const pct = ((val - min) / (max - min)) * 100;
    input.style.background = `linear-gradient(to right, var(--range-fill, var(--accent-color)) 0%, var(--range-fill, var(--accent-color)) ${pct}%, var(--range-bg, #3f3f3f) ${pct}%, var(--range-bg, #3f3f3f) 100%)`;
  };

  const onInputHandler = () => {
    updateFill();
    options?.onInput?.(Number(input.value));
  };

  input.addEventListener("input", onInputHandler);
  updateFill();

  return {
    element: input,
    getValue: () => Number(input.value),
    setValue(value: number) {
      input.value = String(value);
      updateFill();
    },
    setEnabled(enabled: boolean) {
      input.disabled = !enabled;
    },
    destroy() {
      input.removeEventListener("input", onInputHandler);
    },
  };
}
