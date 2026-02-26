import { describe, it, expect, vi } from "vitest";
import { EventBus } from "@/core/events";

describe("EventBus", () => {
  it("should call listeners when an event is emitted", () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on("test", listener);
    bus.emit("test", "hello");

    expect(listener).toHaveBeenCalledWith("hello");
  });

  it("should support multiple listeners for the same event", () => {
    const bus = new EventBus();
    const listenerA = vi.fn();
    const listenerB = vi.fn();

    bus.on("test", listenerA);
    bus.on("test", listenerB);
    bus.emit("test", 42);

    expect(listenerA).toHaveBeenCalledWith(42);
    expect(listenerB).toHaveBeenCalledWith(42);
  });

  it("should not call listeners after they are removed", () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on("test", listener);
    bus.off("test", listener);
    bus.emit("test", "ignored");

    expect(listener).not.toHaveBeenCalled();
  });

  it("should not call listeners for different events", () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on("other", listener);
    bus.emit("test", "hello");

    expect(listener).not.toHaveBeenCalled();
  });

  it("should clear all listeners", () => {
    const bus = new EventBus();
    const listener = vi.fn();

    bus.on("test", listener);
    bus.clear();
    bus.emit("test", "ignored");

    expect(listener).not.toHaveBeenCalled();
  });
});
