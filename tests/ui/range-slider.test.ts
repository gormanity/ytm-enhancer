import { describe, it, expect, vi } from "vitest";
import { createRangeSlider } from "@/ui/range-slider";

describe("createRangeSlider", () => {
  it("should create an input element with range-slider class", () => {
    const slider = createRangeSlider();
    expect(slider.element.tagName).toBe("INPUT");
    expect(slider.element.type).toBe("range");
    expect(slider.element.classList.contains("range-slider")).toBe(true);
  });

  it("should use default min/max/value", () => {
    const slider = createRangeSlider();
    expect(slider.element.min).toBe("0");
    expect(slider.element.max).toBe("100");
    expect(slider.element.value).toBe("0");
  });

  it("should apply custom min, max, value, and step", () => {
    const slider = createRangeSlider({
      min: 10,
      max: 200,
      value: 50,
      step: 5,
    });
    expect(slider.element.min).toBe("10");
    expect(slider.element.max).toBe("200");
    expect(slider.element.value).toBe("50");
    expect(slider.element.step).toBe("5");
  });

  it("should apply filled-track gradient on creation", () => {
    const slider = createRangeSlider({ value: 50 });
    expect(slider.element.style.background).toContain("linear-gradient");
    expect(slider.element.style.background).toContain("50%");
  });

  it("should update fill gradient on user input", () => {
    const slider = createRangeSlider();
    slider.element.value = "75";
    slider.element.dispatchEvent(new Event("input"));
    expect(slider.element.style.background).toContain("75%");
  });

  it("should call onInput callback on user input", () => {
    const onInput = vi.fn();
    const slider = createRangeSlider({ onInput });
    slider.element.value = "42";
    slider.element.dispatchEvent(new Event("input"));
    expect(onInput).toHaveBeenCalledWith(42);
  });

  it("should update fill gradient on programmatic setValue", () => {
    const slider = createRangeSlider();
    slider.setValue(60);
    expect(slider.element.value).toBe("60");
    expect(slider.element.style.background).toContain("60%");
  });

  it("should return current value from getValue", () => {
    const slider = createRangeSlider({ value: 33 });
    expect(slider.getValue()).toBe(33);
    slider.setValue(77);
    expect(slider.getValue()).toBe(77);
  });

  it("should enable and disable the input", () => {
    const slider = createRangeSlider();
    slider.setEnabled(false);
    expect(slider.element.disabled).toBe(true);
    slider.setEnabled(true);
    expect(slider.element.disabled).toBe(false);
  });

  it("should remove event listener on destroy", () => {
    const onInput = vi.fn();
    const slider = createRangeSlider({ onInput });
    slider.destroy();
    slider.element.value = "50";
    slider.element.dispatchEvent(new Event("input"));
    expect(onInput).not.toHaveBeenCalled();
  });

  it("should compute fill correctly for non-zero min", () => {
    const slider = createRangeSlider({ min: 50, max: 150, value: 100 });
    // (100 - 50) / (150 - 50) = 50%
    expect(slider.element.style.background).toContain("50%");
  });

  it("should use CSS custom properties for fill colors", () => {
    const slider = createRangeSlider({ value: 50 });
    const bg = slider.element.style.background;
    expect(bg).toContain("var(--range-fill, var(--accent-color))");
    expect(bg).toContain("var(--range-bg, #3f3f3f)");
  });

  it("should produce independent instances", () => {
    const a = createRangeSlider({ value: 20 });
    const b = createRangeSlider({ value: 80 });
    expect(a.getValue()).toBe(20);
    expect(b.getValue()).toBe(80);
    a.setValue(50);
    expect(a.getValue()).toBe(50);
    expect(b.getValue()).toBe(80);
  });
});
