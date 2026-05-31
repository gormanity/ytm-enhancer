import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaybackControlsPopupView } from "@/modules/playback-controls/popup";
import type { ModuleContext } from "@/core/types";
import type { YtmRuntimeClient } from "@/core/ytm-client";
import { createRuntimeClient } from "@/core/messaging";
import { createShortcutCommandClient } from "@/core/commands";

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

function createModuleContext(
  ytmOverrides: Partial<YtmRuntimeClient> = {},
): ModuleContext {
  return {
    events: {} as ModuleContext["events"],
    popup: {} as ModuleContext["popup"],
    capabilities: {} as ModuleContext["capabilities"],
    runtime: createRuntimeClient(),
    state: { saveValue: vi.fn() },
    storage: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
    },
    commands: createShortcutCommandClient(),
    popupEvents: { broadcast: vi.fn() },
    ytm: {
      listTabs: vi.fn().mockResolvedValue({
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
        selectedTabId: 1,
      }),
      selectTab: vi.fn().mockResolvedValue(undefined),
      focusTab: vi.fn().mockResolvedValue(undefined),
      getTabArtwork: vi.fn().mockResolvedValue(null),
      getPlaybackState: vi.fn().mockResolvedValue({
        title: "Track A",
        artist: "Artist A",
        album: null,
        year: null,
        artworkUrl: null,
        isPlaying: false,
        progress: 0,
        duration: 0,
      }),
      executePlaybackAction: vi.fn().mockResolvedValue(undefined),
      seekTo: vi.fn().mockResolvedValue(undefined),
      getVolume: vi.fn().mockResolvedValue(0.5),
      setVolume: vi.fn().mockResolvedValue(undefined),
      getPlaybackSpeed: vi.fn().mockResolvedValue(1),
      setPlaybackSpeed: vi.fn().mockResolvedValue(undefined),
      getStreamQuality: vi.fn().mockResolvedValue({ current: "2" } as never),
      setStreamQuality: vi.fn().mockResolvedValue(undefined),
      broadcast: vi.fn().mockResolvedValue(undefined),
      ...ytmOverrides,
    },
  };
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

  it("uses the injected YTM client for tab and playback state", async () => {
    const listTabs = vi.fn().mockResolvedValue({
      tabs: [
        {
          id: 1,
          title: "Tab 1 - YouTube Music",
          artworkUrl: null,
          isSelected: true,
        },
      ],
      selectedTabId: 1,
    });
    const getPlaybackState = vi.fn().mockResolvedValue({
      title: "Track A",
      artist: "Artist A",
      album: null,
      year: null,
      artworkUrl: null,
      isPlaying: false,
      progress: 0,
      duration: 0,
    });
    const view = createPlaybackControlsPopupView(
      createModuleContext({ listTabs, getPlaybackState }),
    );
    const container = document.createElement("div");
    const cleanup = view.render(container);

    await vi.waitFor(() => {
      expect(listTabs).toHaveBeenCalled();
      expect(getPlaybackState).toHaveBeenCalled();
    });
    expect(sendMessageMock).not.toHaveBeenCalledWith(
      { type: "get-ytm-tabs" },
      expect.any(Function),
    );

    cleanup?.();
  });

  it("renders music source chips with bundled YTM logo fallback", async () => {
    const view = createPlaybackControlsPopupView(createModuleContext());
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
    const view = createPlaybackControlsPopupView(
      createModuleContext({
        listTabs: vi.fn().mockResolvedValue({
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
          selectedTabId: 1,
        }),
      }),
    );
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
    const view = createPlaybackControlsPopupView(
      createModuleContext({
        getTabArtwork: vi
          .fn()
          .mockResolvedValue("https://example.com/bad-artwork.jpg"),
      }),
    );
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
    const selectTab = vi.fn().mockResolvedValue(undefined);
    const view = createPlaybackControlsPopupView(
      createModuleContext({ selectTab }),
    );
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
    expect(selectTab).toHaveBeenCalledWith(2);

    cleanup?.();
  });

  it("persists selected music source tab across popup reopen", async () => {
    let selectedTabId = 1;
    const listTabs = vi.fn().mockImplementation(() =>
      Promise.resolve({
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
        selectedTabId,
      }),
    );
    const selectTab = vi.fn().mockImplementation((tabId: number) => {
      selectedTabId = tabId;
      return Promise.resolve();
    });
    const view = createPlaybackControlsPopupView(
      createModuleContext({ listTabs, selectTab }),
    );
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
    const seekTo = vi.fn().mockResolvedValue(undefined);
    const view = createPlaybackControlsPopupView(
      createModuleContext({
        listTabs: vi.fn().mockResolvedValue({ tabs: [], selectedTabId: null }),
        getPlaybackState: vi.fn().mockResolvedValue({
          title: "Track A",
          artist: "Artist A",
          album: null,
          year: null,
          artworkUrl: null,
          isPlaying: true,
          progress: 25,
          duration: 200,
        }),
        seekTo,
      }),
    );
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

    expect(seekTo).toHaveBeenCalledWith(100);

    cleanup?.();
  });

  it("renders repeat mode state and sends repeat action through the YTM client", async () => {
    const executePlaybackAction = vi.fn().mockResolvedValue(undefined);
    const view = createPlaybackControlsPopupView(
      createModuleContext({
        listTabs: vi.fn().mockResolvedValue({ tabs: [], selectedTabId: null }),
        getPlaybackState: vi.fn().mockResolvedValue({
          title: "Track A",
          artist: "Artist A",
          album: null,
          year: null,
          artworkUrl: null,
          isPlaying: true,
          progress: 0,
          duration: 0,
          repeatMode: "one",
        }),
        executePlaybackAction,
      }),
    );
    const container = document.createElement("div");
    const cleanup = view.render(container);

    const repeatButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-repeat"]',
      );
      expect(button).not.toBeNull();
      return button!;
    });

    expect(repeatButton.classList.contains("active")).toBe(true);
    expect(repeatButton.getAttribute("aria-pressed")).toBe("true");
    expect(repeatButton.title).toBe("Repeat one");

    repeatButton.click();

    expect(executePlaybackAction).toHaveBeenCalledWith("repeat");

    cleanup?.();
  });

  it("renders shuffle state and sends shuffle action through the YTM client", async () => {
    const executePlaybackAction = vi.fn().mockResolvedValue(undefined);
    const view = createPlaybackControlsPopupView(
      createModuleContext({
        listTabs: vi.fn().mockResolvedValue({ tabs: [], selectedTabId: null }),
        getPlaybackState: vi.fn().mockResolvedValue({
          title: "Track A",
          artist: "Artist A",
          album: null,
          year: null,
          artworkUrl: null,
          isPlaying: true,
          progress: 0,
          duration: 0,
          isShuffling: true,
        }),
        executePlaybackAction,
      }),
    );
    const container = document.createElement("div");
    const cleanup = view.render(container);

    const shuffleButton = await vi.waitFor(() => {
      const button = container.querySelector<HTMLButtonElement>(
        '[data-role="quick-now-playing-shuffle"]',
      );
      expect(button).not.toBeNull();
      return button!;
    });

    expect(shuffleButton.classList.contains("active")).toBe(true);
    expect(shuffleButton.getAttribute("aria-pressed")).toBe("true");
    expect(shuffleButton.title).toBe("Shuffle on");

    shuffleButton.click();

    expect(executePlaybackAction).toHaveBeenCalledWith("shuffle");

    cleanup?.();
  });
});
