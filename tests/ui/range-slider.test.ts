import { describe, it, expect, vi } from "vitest";
import { createRangeSlider } from "@/ui/range-slider";

describe("createRangeSlider", () => {
  it("should create a row with label, range input, and number input", () => {
    const slider = createRangeSlider({ label: "Volume" });
    expect(slider.element.classList.contains("range-slider-row")).toBe(true);
    expect(
      slider.element.querySelector(".range-slider-label")?.textContent,
    ).toBe("Volume");
    expect(slider.element.querySelector(".range-slider")).not.toBeNull();
    expect(slider.element.querySelector(".range-slider-number")).not.toBeNull();
  });

  it("should use default min/max/value", () => {
    const slider = createRangeSlider({ label: "Test" });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;
    expect(range.min).toBe("0");
    expect(range.max).toBe("100");
    expect(range.value).toBe("0");
    expect(number.min).toBe("0");
    expect(number.max).toBe("100");
    expect(number.value).toBe("0");
  });

  it("should apply custom min, max, value, and step", () => {
    const slider = createRangeSlider({
      label: "Test",
      min: 10,
      max: 200,
      value: 50,
      step: 5,
    });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;
    expect(range.min).toBe("10");
    expect(range.max).toBe("200");
    expect(range.value).toBe("50");
    expect(range.step).toBe("5");
    expect(number.step).toBe("5");
  });

  it("should display unit suffix", () => {
    const slider = createRangeSlider({ label: "Test", unit: "%" });
    const unit = slider.element.querySelector(".range-slider-unit");
    expect(unit?.textContent).toBe("%");
  });

  it("should apply filled-track gradient on creation", () => {
    const slider = createRangeSlider({ label: "Test", value: 50 });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    expect(range.style.background).toContain("linear-gradient");
    expect(range.style.background).toContain("50%");
  });

  it("should update fill and number input on slider drag", () => {
    const onInput = vi.fn();
    const slider = createRangeSlider({ label: "Test", onInput });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;

    range.value = "75";
    range.dispatchEvent(new Event("input"));

    expect(number.value).toBe("75");
    expect(range.style.background).toContain("75%");
    expect(onInput).toHaveBeenCalledWith(75);
  });

  it("should sync slider from number input and clamp", () => {
    const onInput = vi.fn();
    const slider = createRangeSlider({ label: "Test", onInput });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;

    number.value = "150";
    number.dispatchEvent(new Event("change"));

    expect(number.value).toBe("100");
    expect(range.value).toBe("100");
    expect(onInput).toHaveBeenCalledWith(100);
  });

  it("should update fill and number on programmatic setValue", () => {
    const slider = createRangeSlider({ label: "Test" });
    slider.setValue(60);
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;
    expect(range.value).toBe("60");
    expect(number.value).toBe("60");
    expect(range.style.background).toContain("60%");
  });

  it("should return current value from getValue", () => {
    const slider = createRangeSlider({ label: "Test", value: 33 });
    expect(slider.getValue()).toBe(33);
    slider.setValue(77);
    expect(slider.getValue()).toBe(77);
  });

  it("should enable and disable both inputs", () => {
    const slider = createRangeSlider({ label: "Test" });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;

    slider.setEnabled(false);
    expect(range.disabled).toBe(true);
    expect(number.disabled).toBe(true);

    slider.setEnabled(true);
    expect(range.disabled).toBe(false);
    expect(number.disabled).toBe(false);
  });

  it("should remove event listeners on destroy", () => {
    const onInput = vi.fn();
    const slider = createRangeSlider({ label: "Test", onInput });
    slider.destroy();

    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    range.value = "50";
    range.dispatchEvent(new Event("input"));
    expect(onInput).not.toHaveBeenCalled();
  });

  it("should compute fill correctly for non-zero min", () => {
    const slider = createRangeSlider({
      label: "Test",
      min: 50,
      max: 150,
      value: 100,
    });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    // (100 - 50) / (150 - 50) = 50%
    expect(range.style.background).toContain("50%");
  });

  it("should use CSS custom properties for fill colors", () => {
    const slider = createRangeSlider({ label: "Test", value: 50 });
    const range =
      slider.element.querySelector<HTMLInputElement>(".range-slider")!;
    const bg = range.style.background;
    expect(bg).toContain("var(--range-fill, var(--accent-color))");
    expect(bg).toContain("var(--range-bg, #3f3f3f)");
  });

  it("should produce independent instances", () => {
    const a = createRangeSlider({ label: "A", value: 20 });
    const b = createRangeSlider({ label: "B", value: 80 });
    expect(a.getValue()).toBe(20);
    expect(b.getValue()).toBe(80);
    a.setValue(50);
    expect(a.getValue()).toBe(50);
    expect(b.getValue()).toBe(80);
  });

  it("should clamp number input below min", () => {
    const slider = createRangeSlider({ label: "Test", min: 10 });
    const number = slider.element.querySelector<HTMLInputElement>(
      ".range-slider-number",
    )!;
    number.value = "5";
    number.dispatchEvent(new Event("change"));
    expect(number.value).toBe("10");
  });
});
