import { describe, it, expect, vi, beforeEach } from "vitest";
import { PipButton } from "@/modules/mini-player/pip-button";

describe("PipButton", () => {
  let onClick: ReturnType<typeof vi.fn<() => void>>;
  let pipButton: PipButton;

  beforeEach(() => {
    onClick = vi.fn<() => void>();
    pipButton = new PipButton(onClick);
  });

  describe("native button hijack", () => {
    it("should attach a capture-phase listener to the native button", () => {
      const nativeButton = document.createElement("button");
      const spy = vi.spyOn(nativeButton, "addEventListener");

      pipButton.attach(nativeButton);

      expect(spy).toHaveBeenCalledWith("click", expect.any(Function), true);
    });

    it("should fire the callback when the native button is clicked", () => {
      const nativeButton = document.createElement("button");

      pipButton.attach(nativeButton);
      nativeButton.click();

      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("should stop propagation and prevent default on native click", () => {
      const nativeButton = document.createElement("button");

      pipButton.attach(nativeButton);

      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      });
      const stopPropagation = vi.spyOn(event, "stopPropagation");
      const preventDefault = vi.spyOn(event, "preventDefault");
      nativeButton.dispatchEvent(event);

      expect(stopPropagation).toHaveBeenCalled();
      expect(preventDefault).toHaveBeenCalled();
    });

    it("should remove the capture listener on remove()", () => {
      const nativeButton = document.createElement("button");
      const spy = vi.spyOn(nativeButton, "removeEventListener");

      pipButton.attach(nativeButton);
      pipButton.remove();

      expect(spy).toHaveBeenCalledWith("click", expect.any(Function), true);
    });

    it("should not fire the callback after remove()", () => {
      const nativeButton = document.createElement("button");

      pipButton.attach(nativeButton);
      pipButton.remove();
      nativeButton.click();

      expect(onClick).not.toHaveBeenCalled();
    });
  });

  describe("custom button fallback", () => {
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

    it("should contain an SVG icon", () => {
      const container = document.createElement("div");

      pipButton.inject(container);

      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  });

  it("should not throw when removing without attaching or injecting", () => {
    expect(() => pipButton.remove()).not.toThrow();
  });
});
