/**
 * Shared progress bar controller.
 *
 * Manages fill/thumb position, drag-to-seek, and timestamp
 * formatting. Used by both the popup now-playing card and the
 * PiP mini player.
 */

import templateHtml from "./progress-bar.html?raw";

export interface ProgressBarElements {
  /** The clickable bar area (receives mousedown). */
  bar: HTMLElement;
  /** The filled portion of the bar. */
  fill: HTMLElement;
  /** The draggable thumb indicator. */
  thumb: HTMLElement;
}

export interface ProgressBarOptions {
  /** Called when the user seeks to a position (time in seconds). */
  onSeek: (time: number) => void;
  /**
   * Called during drag with the current ratio (0–1).
   * Use to update elapsed time display while dragging.
   */
  onDrag?: (ratio: number) => void;
  /**
   * CSS class applied to the bar element during drag.
   * Default: `"is-dragging"`.
   */
  draggingClass?: string;
  /**
   * Document to attach mousemove/mouseup listeners to.
   * Default: `document`. Set to the PiP document when used
   * inside a Document PiP window.
   */
  doc?: Document;
}

export class ProgressBarController {
  private isDragging = false;
  private lastDuration = 0;
  private elements: ProgressBarElements;
  private onSeek: (time: number) => void;
  private onDrag: ((ratio: number) => void) | null;
  private draggingClass: string;
  private doc: Document;
  private boundOnMouseDown: (e: MouseEvent) => void;

  constructor(elements: ProgressBarElements, options: ProgressBarOptions) {
    this.elements = elements;
    this.onSeek = options.onSeek;
    this.onDrag = options.onDrag ?? null;
    this.draggingClass = options.draggingClass ?? "is-dragging";
    this.doc = options.doc ?? document;

    this.boundOnMouseDown = (e: MouseEvent) => this.handleMouseDown(e);
    elements.bar.addEventListener("mousedown", this.boundOnMouseDown);
  }

  /**
   * Update the progress bar from external state (e.g., polling).
   * Skipped while the user is dragging to avoid fighting the thumb.
   */
  setProgress(progress: number, duration: number): void {
    this.lastDuration = duration;
    if (this.isDragging) return;
    const pct = progressPercent(progress, duration);
    this.applyPosition(pct);
  }

  /** Whether the user is currently dragging the progress bar. */
  get dragging(): boolean {
    return this.isDragging;
  }

  /** Remove event listeners. */
  destroy(): void {
    this.elements.bar.removeEventListener("mousedown", this.boundOnMouseDown);
  }

  private applyPosition(pct: number): void {
    const clamped = Math.max(0, Math.min(100, pct));
    this.elements.fill.style.width = clamped + "%";
    this.elements.thumb.style.left = clamped + "%";
  }

  private ratioFromEvent(e: MouseEvent): number {
    const rect = this.elements.bar.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  }

  private seekFromEvent(e: MouseEvent): void {
    if (this.lastDuration <= 0) return;
    const ratio = this.ratioFromEvent(e);
    this.applyPosition(ratio * 100);
    this.onDrag?.(ratio);
    this.onSeek(ratio * this.lastDuration);
  }

  private handleMouseDown(e: MouseEvent): void {
    if (this.lastDuration <= 0) return;
    this.isDragging = true;
    this.elements.bar.classList.add(this.draggingClass);
    this.seekFromEvent(e);

    const onMove = (moveEvent: MouseEvent) => this.seekFromEvent(moveEvent);
    const onUp = () => {
      this.isDragging = false;
      this.elements.bar.classList.remove(this.draggingClass);
      this.doc.removeEventListener("mousemove", onMove);
      this.doc.removeEventListener("mouseup", onUp);
    };
    this.doc.addEventListener("mousemove", onMove);
    this.doc.addEventListener("mouseup", onUp);
  }
}

/** A fully encapsulated progress bar component. */
export interface ProgressBarComponent {
  /** Root element — append this to the DOM. */
  element: HTMLElement;
  /** Update bar position and time labels from external state. */
  setProgress(current: number, duration: number): void;
  /** Whether the user is currently dragging. */
  readonly dragging: boolean;
  /** Remove all event listeners. */
  destroy(): void;
}

export interface CreateProgressBarOptions {
  /** Called when the user seeks to a position (time in seconds). */
  onSeek: (time: number) => void;
  /**
   * Document to create elements in and attach drag listeners to.
   * Default: `document`. Set to the PiP document when used inside
   * a Document PiP window.
   */
  doc?: Document;
}

/**
 * Create a self-contained progress bar from the shared HTML
 * template with fill, thumb, time labels, and drag-to-seek.
 *
 * Just append `element` to the DOM and call `setProgress()`.
 */
export function createProgressBar(
  options: CreateProgressBarOptions,
): ProgressBarComponent {
  const doc = options.doc ?? document;

  const parsed = new DOMParser().parseFromString(
    templateHtml.trim(),
    "text/html",
  );
  const wrapper = doc.importNode(
    parsed.body.firstElementChild!,
    true,
  ) as HTMLElement;

  const bar = wrapper.querySelector<HTMLElement>(".progress-bar")!;
  const fill = wrapper.querySelector<HTMLElement>(".progress-fill")!;
  const thumb = wrapper.querySelector<HTMLElement>(".progress-thumb")!;
  const tooltip = wrapper.querySelector<HTMLElement>(
    ".progress-hover-tooltip",
  )!;
  const elapsedEl = wrapper.querySelector<HTMLElement>(".progress-elapsed")!;
  const durationEl = wrapper.querySelector<HTMLElement>(".progress-duration")!;

  let lastDuration = 0;

  const ctrl = new ProgressBarController(
    { bar, fill, thumb },
    {
      onSeek: options.onSeek,
      onDrag: (ratio) => {
        elapsedEl.textContent = formatTimestamp(ratio * lastDuration);
      },
      doc,
    },
  );

  bar.addEventListener("mousemove", (e: MouseEvent) => {
    if (lastDuration <= 0) return;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    tooltip.textContent = formatTimestamp(ratio * lastDuration);
    tooltip.style.left = ratio * 100 + "%";
  });

  return {
    element: wrapper,

    setProgress(current: number, duration: number): void {
      lastDuration = duration;
      ctrl.setProgress(current, duration);
      if (!ctrl.dragging) {
        elapsedEl.textContent = formatTimestamp(current);
      }
      durationEl.textContent = formatTimestamp(duration);
    },

    get dragging(): boolean {
      return ctrl.dragging;
    },

    destroy(): void {
      ctrl.destroy();
    },
  };
}

/**
 * Calculate progress as a percentage (0–100), rounded.
 */
export function progressPercent(progress: number, duration: number): number {
  if (duration <= 0) return 0;
  return Math.round((progress / duration) * 100);
}

/**
 * Format seconds as a timestamp string.
 *
 * - Under 1 hour: `m:ss` (e.g., `3:05`)
 * - 1 hour or more: `h:mm:ss` (e.g., `1:02:30`)
 */
export function formatTimestamp(totalSeconds: number): string {
  const rounded = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = rounded % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}
