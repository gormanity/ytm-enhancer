import { describe, it, expect, vi, beforeEach } from "vitest";
import { NotificationsModule } from "@/modules/notifications";

describe("notifications popup view", () => {
  let module: NotificationsModule;

  beforeEach(() => {
    vi.stubGlobal("chrome", {
      notifications: {
        create: vi.fn(),
        clear: vi.fn(),
      },
      storage: {
        local: {
          get: vi.fn().mockResolvedValue({}),
          set: vi.fn().mockResolvedValue(undefined),
          remove: vi.fn().mockResolvedValue(undefined),
        },
      },
    });

    module = new NotificationsModule();
  });

  it("should render a toggle switch", () => {
    const views = module.getPopupViews();
    const container = document.createElement("div");

    views[0].render(container);

    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(true);
  });

  it("should render a heading", () => {
    const views = module.getPopupViews();
    const container = document.createElement("div");

    views[0].render(container);

    const heading = container.querySelector("h2");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe("Track Notifications");
  });

  it("should toggle enabled state when checkbox is clicked", () => {
    const views = module.getPopupViews();
    const container = document.createElement("div");

    views[0].render(container);

    const toggle = container.querySelector<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    expect(module.isEnabled()).toBe(true);

    toggle!.checked = false;
    toggle!.dispatchEvent(new Event("change"));

    expect(module.isEnabled()).toBe(false);
  });
});
