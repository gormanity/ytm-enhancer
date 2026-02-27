import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipButton } from "@/modules/mini-player/pip-button";

describe("PipButton", () => {
  let onClick: ReturnType<typeof vi.fn<() => void>>;
  let pipButton: PipButton;

  beforeEach(() => {
    onClick = vi.fn<() => void>();
    pipButton = new PipButton(onClick);
  });

  it("should inject a button into the container", () => {
    const container = document.createElement("div");

    pipButton.inject(container);

    const button = container.querySelector("button");
    expect(button).not.toBeNull();
  });

  it("should set an aria-label on the button", () => {
    const container = document.createElement("div");

    pipButton.inject(container);

    const button = container.querySelector("button");
    expect(button?.getAttribute("aria-label")).toBe("Open mini player");
  });

  it("should fire the callback on click", () => {
    const container = document.createElement("div");

    pipButton.inject(container);

    const button = container.querySelector("button")!;
    button.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("should be a no-op if container is null", () => {
    expect(() => pipButton.inject(null)).not.toThrow();
  });

  it("should remove the button from the DOM", () => {
    const container = document.createElement("div");

    pipButton.inject(container);
    expect(container.querySelector("button")).not.toBeNull();

    pipButton.remove();
    expect(container.querySelector("button")).toBeNull();
  });

  it("should not throw when removing without injecting", () => {
    expect(() => pipButton.remove()).not.toThrow();
  });

  it("should contain an SVG icon", () => {
    const container = document.createElement("div");

    pipButton.inject(container);

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
  });
});
