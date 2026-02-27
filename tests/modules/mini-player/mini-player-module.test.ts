import { describe, it, expect, beforeEach } from "vitest";
import { MiniPlayerModule } from "@/modules/mini-player";

describe("MiniPlayerModule", () => {
  let module: MiniPlayerModule;

  beforeEach(() => {
    module = new MiniPlayerModule();
  });

  it("should have the correct module metadata", () => {
    expect(module.id).toBe("mini-player");
    expect(module.name).toBe("Mini Player");
    expect(module.description).toBeDefined();
  });

  it("should be enabled by default", () => {
    expect(module.isEnabled()).toBe(true);
  });

  it("should allow toggling enabled state", () => {
    module.setEnabled(false);
    expect(module.isEnabled()).toBe(false);
    module.setEnabled(true);
    expect(module.isEnabled()).toBe(true);
  });

  it("should provide popup views", () => {
    const views = module.getPopupViews();
    expect(views).toHaveLength(1);
    expect(views[0].id).toBe("mini-player-settings");
  });

  it("should have no-op init and destroy", () => {
    expect(() => module.init()).not.toThrow();
    expect(() => module.destroy()).not.toThrow();
  });
});
