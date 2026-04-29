import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaybackControlsPopupView } from "@/modules/playback-controls/popup";

interface RuntimeMessage {
  type: string;
  tabId?: number;
  action?: string;
  time?: number;
}

const GOOD_ARTWORK_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0x8AAAAASUVORK5CYII=";

class MockImage {
  onload: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null;
  onerror: ((this: GlobalEventHandlers, ev: Event) => unknown) | null = null;

  set src(value: string) {
    queueMicrotask(() => {
      if (value.includes("good-artwork") || value.startsWith("data:image/")) {
        this.onload?.call(window, new Event("load"));
        return;
      }
      this.onerror?.call(window, new Event("error"));
    });
  }
}

describe("playback controls popup view", () => {
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let onMessageAddListenerMock: ReturnType<typeof vi.fn>;
  let onMessageRemoveListenerMock: ReturnType<typeof vi.fn>;
  const svgLogoMarker = "data:image/svg+xml";

  beforeEach(() => {
    onMessageAddListenerMock = vi.fn();
    onMessageRemoveListenerMock = vi.fn();
    sendMessageMock = vi.fn(
      (message: RuntimeMessage, callback?: (response: unknown) => void) => {
        switch (message.type) {
          case "get-ytm-tabs":
            callback?.({
              ok: true,
              data: {
                tabs: [
                  {
                    id: 1,
                    title: "Tab 1 - YouTube Music",
                    artworkUrl: null,
                    isSelected: true,
                  },
                  {
                    id: 2,
                    title: "Tab 2 - YouTube Music",
                    artworkUrl: null,
                    isSelected: false,
                  },
                ],
              },
            });
            return;
          case "get-ytm-tab-artwork":
            callback?.({
              ok: true,
              data: {
                artworkUrl: message.tabId === 1 ? GOOD_ARTWORK_DATA_URL : null,
              },
            });
            return;
          case "get-playback-state":
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
            return;
          case "get-volume":
            callback?.({ ok: true, data: 50 });
            return;
          case "get-playback-speed":
            callback?.({ ok: true, data: "1" });
            return;
          case "get-stream-quality":
            callback?.({ ok: true, data: { current: "2" } });
            return;
          default:
            callback?.({ ok: true });
        }
      },
    );

    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: onMessageAddListenerMock,
          removeListener: onMessageRemoveListenerMock,
        },
      },
    });
  });

  it("renders music source chips with bundled YTM logo fallback", async () => {
    const view = createPlaybackControlsPopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    await vi.waitFor(() => {
      expect(container.querySelectorAll(".tab-item").length).toBe(2);
    });

    const firstIcon =
      container.querySelector<HTMLImageElement>(".tab-item img");
    expect(firstIcon).not.toBeNull();
    expect(firstIcon?.src).toContain(svgLogoMarker);

    cleanup?.();
  });

  it("uses artwork when tab data provides one", async () => {
    sendMessageMock.mockImplementation(
      (message: RuntimeMessage, callback?: (response: unknown) => void) => {
        switch (message.type) {
          case "get-ytm-tabs":
            callback?.({
              ok: true,
              data: {
                tabs: [
                  {
                    id: 1,
                    title: "Tab 1 - YouTube Music",
                    artworkUrl: GOOD_ARTWORK_DATA_URL,
                    isSelected: true,
                  },
                  {
                    id: 2,
                    title: "Tab 2 - YouTube Music",
                    artworkUrl: null,
                    isSelected: false,
                  },
                ],
              },
            });
            return;
          case "get-ytm-tab-artwork":
            callback?.({ ok: true, data: { artworkUrl: null } });
            return;
          case "get-playback-state":
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
            return;
          case "get-volume":
            callback?.({ ok: true, data: 50 });
            return;
          case "get-playback-speed":
            callback?.({ ok: true, data: "1" });
            return;
          case "get-stream-quality":
            callback?.({ ok: true, data: { current: "2" } });
            return;
          default:
            callback?.({ ok: true });
        }
      },
    );

    const view = createPlaybackControlsPopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    await vi.waitFor(() => {
      const firstIcon =
        container.querySelector<HTMLImageElement>(".tab-item img");
      expect(firstIcon?.src).toContain("data:image/png");
    });

    cleanup?.();
  });

  it("keeps fallback logo when artwork preload fails", async () => {
    sendMessageMock.mockImplementation(
      (message: RuntimeMessage, callback?: (response: unknown) => void) => {
        switch (message.type) {
          case "get-ytm-tabs":
            callback?.({
              ok: true,
              data: {
                tabs: [
                  {
                    id: 1,
                    title: "Tab 1 - YouTube Music",
                    artworkUrl: null,
                    isSelected: true,
                  },
                  {
                    id: 2,
                    title: "Tab 2 - YouTube Music",
                    artworkUrl: null,
                    isSelected: false,
                  },
                ],
              },
            });
            return;
          case "get-ytm-tab-artwork":
            callback?.({
              ok: true,
              data: { artworkUrl: "https://example.com/bad-artwork.jpg" },
            });
            return;
          case "get-playback-state":
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
            return;
          case "get-volume":
            callback?.({ ok: true, data: 50 });
            return;
          case "get-playback-speed":
            callback?.({ ok: true, data: "1" });
            return;
          case "get-stream-quality":
            callback?.({ ok: true, data: { current: "2" } });
            return;
          default:
            callback?.({ ok: true });
        }
      },
    );

    const view = createPlaybackControlsPopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    await vi.waitFor(() => {
      expect(container.querySelectorAll(".tab-item").length).toBe(2);
    });

    const firstIcon =
      container.querySelector<HTMLImageElement>(".tab-item img");
    expect(firstIcon?.src).toContain(svgLogoMarker);
    expect(firstIcon?.src).not.toContain("bad-artwork.jpg");

    cleanup?.();
  });

  it("cycles selected music source tab on Tab key", async () => {
    const view = createPlaybackControlsPopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    await vi.waitFor(() => {
      expect(container.querySelectorAll(".tab-item").length).toBe(2);
    });

    const tabEvent = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "set-selected-tab",
      tabId: 2,
    });

    cleanup?.();
  });

  it("persists selected music source tab across popup reopen", async () => {
    let selectedTabId = 1;
    sendMessageMock.mockImplementation(
      (message: RuntimeMessage, callback?: (response: unknown) => void) => {
        switch (message.type) {
          case "get-ytm-tabs":
            callback?.({
              ok: true,
              data: {
                tabs: [
                  {
                    id: 1,
                    title: "Tab 1 - YouTube Music",
                    artworkUrl: null,
                    isSelected: selectedTabId === 1,
                  },
                  {
                    id: 2,
                    title: "Tab 2 - YouTube Music",
                    artworkUrl: null,
                    isSelected: selectedTabId === 2,
                  },
                ],
              },
            });
            return;
          case "set-selected-tab":
            selectedTabId = message.tabId ?? selectedTabId;
            callback?.({ ok: true });
            return;
          case "get-ytm-tab-artwork":
            callback?.({ ok: true, data: { artworkUrl: null } });
            return;
          case "get-playback-state":
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
            return;
          case "get-volume":
            callback?.({ ok: true, data: 50 });
            return;
          case "get-playback-speed":
            callback?.({ ok: true, data: "1" });
            return;
          case "get-stream-quality":
            callback?.({ ok: true, data: { current: "2" } });
            return;
          default:
            callback?.({ ok: true });
        }
      },
    );

    const view = createPlaybackControlsPopupView();
    const firstContainer = document.createElement("div");
    const firstCleanup = view.render(firstContainer);

    await vi.waitFor(() => {
      expect(firstContainer.querySelectorAll(".tab-item").length).toBe(2);
    });

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        bubbles: true,
        cancelable: true,
      }),
    );

    await vi.waitFor(() => {
      expect(selectedTabId).toBe(2);
    });
    firstCleanup?.();

    const secondContainer = document.createElement("div");
    const secondCleanup = view.render(secondContainer);

    await vi.waitFor(() => {
      expect(secondContainer.querySelectorAll(".tab-item").length).toBe(2);
    });

    const selectedItem =
      secondContainer.querySelector<HTMLElement>(".tab-item.selected");
    expect(selectedItem).not.toBeNull();
    expect(selectedItem?.title).toBe("Tab 2");

    secondCleanup?.();
  });

  it("sends seek action with the selected time from the progress bar", async () => {
    sendMessageMock.mockImplementation(
      (message: RuntimeMessage, callback?: (response: unknown) => void) => {
        switch (message.type) {
          case "get-ytm-tabs":
            callback?.({ ok: true, data: { tabs: [] } });
            return;
          case "get-playback-state":
            callback?.({
              ok: true,
              data: {
                title: "Track A",
                artist: "Artist A",
                album: null,
                year: null,
                artworkUrl: null,
                isPlaying: true,
                progress: 25,
                duration: 200,
              },
            });
            return;
          case "get-volume":
            callback?.({ ok: true, data: 50 });
            return;
          case "get-playback-speed":
            callback?.({ ok: true, data: "1" });
            return;
          case "get-stream-quality":
            callback?.({ ok: true, data: { current: "2" } });
            return;
          default:
            callback?.({ ok: true });
        }
      },
    );

    const view = createPlaybackControlsPopupView();
    const container = document.createElement("div");
    const cleanup = view.render(container);

    await vi.waitFor(() => {
      expect(container.querySelector(".progress-bar")).not.toBeNull();
    });

    const bar = container.querySelector<HTMLElement>(".progress-bar")!;
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

    bar.dispatchEvent(new MouseEvent("mousedown", { clientX: 200 }));

    expect(sendMessageMock).toHaveBeenCalledWith({
      type: "playback-action",
      action: "seekTo",
      time: 100,
    });

    cleanup?.();
  });
});
