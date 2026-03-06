import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHomePopupView } from "@/modules/home/popup";

describe("createHomePopupView", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(
          (
            message: { type: string },
            callback?: (response: unknown) => void,
          ) => {
            if (message.type === "get-playback-state") {
              callback?.({
                ok: true,
                data: {
                  title: "Track A",
                  artist: "Artist A",
                  album: null,
                  year: null,
                  artworkUrl: null,
                  isPlaying: false,
                  progress: 0,
                  duration: 0,
                },
              });
            }
          },
        ),
      },
    });
  });

  it("should return a popup view with correct metadata", () => {
    const view = createHomePopupView();
    expect(view.id).toBe("home");
    expect(view.label).toBe("Now Playing");
  });

  it("should render now playing structure from template", () => {
    const view = createHomePopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    expect(container.querySelector("h2")?.textContent).toBe("Now Playing");
    expect(container.querySelectorAll(".home-control-btn")).toHaveLength(3);
    expect(container.textContent).toContain("Track A");
    expect(container.textContent).toContain("Artist A");
    cleanup?.();
  });
});
