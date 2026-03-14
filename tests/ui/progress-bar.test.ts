import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ProgressBarController,
  createProgressBar,
  formatTimestamp,
  progressPercent,
} from "@/ui/progress-bar";
import type { ProgressBarElements } from "@/ui/progress-bar";

function createElements(): ProgressBarElements {
  const bar = document.createElement("div");
  const fill = document.createElement("div");
  const thumb = document.createElement("div");
  bar.appendChild(fill);
  bar.appendChild(thumb);
  // Give the bar a bounding rect for seek calculations
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
    left: 100,
    right: 300,
    width: 200,
    top: 0,
    bottom: 10,
    height: 10,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  return { bar, fill, thumb };
}

describe("formatTimestamp", () => {
  it("should format seconds under a minute", () => {
    expect(formatTimestamp(0)).toBe("0:00");
    expect(formatTimestamp(5)).toBe("0:05");
    expect(formatTimestamp(59)).toBe("0:59");
  });

  it("should format minutes", () => {
    expect(formatTimestamp(60)).toBe("1:00");
    expect(formatTimestamp(185)).toBe("3:05");
    expect(formatTimestamp(599)).toBe("9:59");
  });

  it("should format hours", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00");
    expect(formatTimestamp(3750)).toBe("1:02:30");
    expect(formatTimestamp(7384)).toBe("2:03:04");
  });

  it("should handle negative values as zero", () => {
    expect(formatTimestamp(-10)).toBe("0:00");
  });

  it("should floor fractional seconds", () => {
    expect(formatTimestamp(65.9)).toBe("1:05");
  });
});

describe("progressPercent", () => {
  it("should calculate percentage", () => {
    expect(progressPercent(50, 200)).toBe(25);
    expect(progressPercent(100, 200)).toBe(50);
    expect(progressPercent(200, 200)).toBe(100);
  });

  it("should return 0 when duration is 0", () => {
    expect(progressPercent(50, 0)).toBe(0);
  });

  it("should return 0 when duration is negative", () => {
    expect(progressPercent(50, -10)).toBe(0);
  });

  it("should round to nearest integer", () => {
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
  });
});

describe("ProgressBarController", () => {
  let elements: ProgressBarElements;
  let onSeek: ReturnType<typeof vi.fn<(time: number) => void>>;

  beforeEach(() => {
    elements = createElements();
    onSeek = vi.fn<(time: number) => void>();
  });

  it("should update fill and thumb on setProgress", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(30, 100);

    expect(elements.fill.style.width).toBe("30%");
    expect(elements.thumb.style.left).toBe("30%");
  });

  it("should clamp percentage to 0-100", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(150, 100);

    expect(elements.fill.style.width).toBe("100%");
    expect(elements.thumb.style.left).toBe("100%");
  });

  it("should show 0% when duration is 0", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(50, 0);

    expect(elements.fill.style.width).toBe("0%");
    expect(elements.thumb.style.left).toBe("0%");
  });

  it("should call onSeek with correct time on click", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    // Set duration first
    ctrl.setProgress(0, 200);

    // Click at midpoint (clientX=200, bar starts at 100, width 200)
    const mousedown = new MouseEvent("mousedown", { clientX: 200 });
    elements.bar.dispatchEvent(mousedown);

    expect(onSeek).toHaveBeenCalledWith(100); // 50% of 200
  });

  it("should not seek when duration is 0", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 0);

    const mousedown = new MouseEvent("mousedown", { clientX: 200 });
    elements.bar.dispatchEvent(mousedown);

    expect(onSeek).not.toHaveBeenCalled();
  });

  it("should add dragging class during drag", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 200);

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    expect(elements.bar.classList.contains("is-dragging")).toBe(true);

    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(elements.bar.classList.contains("is-dragging")).toBe(false);
  });

  it("should use custom dragging class", () => {
    const ctrl = new ProgressBarController(elements, {
      onSeek,
      draggingClass: "dragging",
    });
    ctrl.setProgress(0, 200);

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    expect(elements.bar.classList.contains("dragging")).toBe(true);
    expect(elements.bar.classList.contains("is-dragging")).toBe(false);

    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(elements.bar.classList.contains("dragging")).toBe(false);
  });

  it("should suppress setProgress during drag", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 200);

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    // Fill is at 50% from the click
    expect(elements.fill.style.width).toBe("50%");

    // Polling update should be ignored
    ctrl.setProgress(10, 200);
    expect(elements.fill.style.width).toBe("50%");

    // After mouseup, setProgress should work again
    document.dispatchEvent(new MouseEvent("mouseup"));
    ctrl.setProgress(10, 200);
    expect(elements.fill.style.width).toBe("5%");
  });

  it("should report dragging state", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 200);

    expect(ctrl.dragging).toBe(false);
    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    expect(ctrl.dragging).toBe(true);
    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(ctrl.dragging).toBe(false);
  });

  it("should call onDrag during drag", () => {
    const onDrag = vi.fn();
    const ctrl = new ProgressBarController(elements, { onSeek, onDrag });
    ctrl.setProgress(0, 200);

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    expect(onDrag).toHaveBeenCalledWith(0.5);
  });

  it("should seek on mousemove during drag", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 200);

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 150 }));
    expect(onSeek).toHaveBeenCalledWith(50); // 25% of 200

    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 250 }));
    expect(onSeek).toHaveBeenCalledWith(150); // 75% of 200
  });

  it("should clamp seek to bar bounds", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 200);

    // Click before bar start
    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));
    expect(onSeek).toHaveBeenCalledWith(0);

    onSeek.mockClear();
    document.dispatchEvent(new MouseEvent("mouseup"));

    // Click after bar end
    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 400 }));
    expect(onSeek).toHaveBeenCalledWith(200);
  });

  it("should use custom doc for drag listeners", () => {
    // Create a mock document-like object
    const mockDoc = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Document;

    const ctrl = new ProgressBarController(elements, {
      onSeek,
      doc: mockDoc,
    });
    ctrl.setProgress(0, 200);

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));

    expect(mockDoc.addEventListener).toHaveBeenCalledWith(
      "mousemove",
      expect.any(Function),
    );
    expect(mockDoc.addEventListener).toHaveBeenCalledWith(
      "mouseup",
      expect.any(Function),
    );
  });

  it("should remove mousedown listener on destroy", () => {
    const ctrl = new ProgressBarController(elements, { onSeek });
    ctrl.setProgress(0, 200);
    ctrl.destroy();

    elements.bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    expect(onSeek).not.toHaveBeenCalled();
  });
});

describe("createProgressBar", () => {
  it("should create element with correct DOM structure", () => {
    const onSeek = vi.fn<(time: number) => void>();
    const pb = createProgressBar({ onSeek });

    expect(pb.element.className).toBe("progress-container");
    expect(pb.element.querySelector(".progress-bar")).toBeTruthy();
    expect(pb.element.querySelector(".progress-fill")).toBeTruthy();
    expect(pb.element.querySelector(".progress-thumb")).toBeTruthy();
    expect(pb.element.querySelector(".progress-time")).toBeTruthy();
    expect(pb.element.querySelectorAll(".progress-time span")).toHaveLength(2);
  });

  it("should show initial time as 0:00", () => {
    const pb = createProgressBar({ onSeek: vi.fn() });
    const spans = pb.element.querySelectorAll(".progress-time span");

    expect(spans[0].textContent).toBe("0:00");
    expect(spans[1].textContent).toBe("0:00");
  });

  it("should update time labels on setProgress", () => {
    const pb = createProgressBar({ onSeek: vi.fn() });
    pb.setProgress(65, 200);

    const spans = pb.element.querySelectorAll(".progress-time span");
    expect(spans[0].textContent).toBe("1:05");
    expect(spans[1].textContent).toBe("3:20");
  });

  it("should update fill and thumb on setProgress", () => {
    const pb = createProgressBar({ onSeek: vi.fn() });
    pb.setProgress(50, 200);

    const fill = pb.element.querySelector<HTMLElement>(".progress-fill")!;
    const thumb = pb.element.querySelector<HTMLElement>(".progress-thumb")!;
    expect(fill.style.width).toBe("25%");
    expect(thumb.style.left).toBe("25%");
  });

  it("should call onSeek on click", () => {
    const onSeek = vi.fn<(time: number) => void>();
    const pb = createProgressBar({ onSeek });

    const bar = pb.element.querySelector<HTMLElement>(".progress-bar")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 100,
      right: 300,
      width: 200,
      top: 0,
      bottom: 10,
      height: 10,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    pb.setProgress(0, 200);
    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));
    expect(onSeek).toHaveBeenCalledWith(100);
  });

  it("should update elapsed during drag", () => {
    const onSeek = vi.fn<(time: number) => void>();
    const pb = createProgressBar({ onSeek });

    const bar = pb.element.querySelector<HTMLElement>(".progress-bar")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    pb.setProgress(0, 300);
    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));

    const elapsed = pb.element.querySelectorAll(".progress-time span")[0];
    expect(elapsed.textContent).toBe("2:30"); // 50% of 300s
  });

  it("should suppress elapsed updates during drag", () => {
    const onSeek = vi.fn<(time: number) => void>();
    const pb = createProgressBar({ onSeek });

    const bar = pb.element.querySelector<HTMLElement>(".progress-bar")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    pb.setProgress(0, 200);
    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));

    // Drag shows 50% of 200 = 100s
    const elapsed = pb.element.querySelectorAll(".progress-time span")[0];
    expect(elapsed.textContent).toBe("1:40");

    // Polling update should not overwrite elapsed
    pb.setProgress(10, 200);
    expect(elapsed.textContent).toBe("1:40");

    // But duration should still update
    const duration = pb.element.querySelectorAll(".progress-time span")[1];
    expect(duration.textContent).toBe("3:20");
  });

  it("should report dragging state", () => {
    const onSeek = vi.fn<(time: number) => void>();
    const pb = createProgressBar({ onSeek });

    const bar = pb.element.querySelector<HTMLElement>(".progress-bar")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    pb.setProgress(0, 200);
    expect(pb.dragging).toBe(false);

    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));
    expect(pb.dragging).toBe(true);

    document.dispatchEvent(new MouseEvent("mouseup"));
    expect(pb.dragging).toBe(false);
  });

  it("should clean up on destroy", () => {
    const onSeek = vi.fn<(time: number) => void>();
    const pb = createProgressBar({ onSeek });

    const bar = pb.element.querySelector<HTMLElement>(".progress-bar")!;
    vi.spyOn(bar, "getBoundingClientRect").mockReturnValue({
      left: 0,
      right: 100,
      width: 100,
      top: 0,
      bottom: 10,
      height: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    pb.setProgress(0, 200);
    pb.destroy();

    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 50 }));
    expect(onSeek).not.toHaveBeenCalled();
  });
});
