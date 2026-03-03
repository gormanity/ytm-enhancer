import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AutoPlayController } from "@/content/auto-play";
import { YTMAdapter } from "@/adapter";

vi.mock("@/adapter", () => {
  const MockYTMAdapter = vi.fn();
  MockYTMAdapter.prototype.getPlaybackState = vi.fn().mockReturnValue({
    title: null,
    artist: null,
    isPlaying: false,
  });
  MockYTMAdapter.prototype.executeAction = vi.fn();
  MockYTMAdapter.prototype.clickQuickPicksPlayAll = vi.fn().mockReturnValue(false);
  return { YTMAdapter: MockYTMAdapter };
});

describe("AutoPlayController", () => {
  let controller: AutoPlayController;
  let sendMessageMock: ReturnType<typeof vi.fn>;
  let addListenerMock: ReturnType<typeof vi.fn>;
  let removeListenerMock: ReturnType<typeof vi.fn>;
  let adapterInstance: {
    getPlaybackState: ReturnType<typeof vi.fn>;
    executeAction: ReturnType<typeof vi.fn>;
    clickQuickPicksPlayAll: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";

    sendMessageMock = vi.fn();
    addListenerMock = vi.fn();
    removeListenerMock = vi.fn();

    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: sendMessageMock,
        onMessage: {
          addListener: addListenerMock,
          removeListener: removeListenerMock,
        },
      },
    });

    // Reset all mocks (including prototype method call counts)
    vi.clearAllMocks();
    controller = new AutoPlayController();
    adapterInstance = vi.mocked(YTMAdapter).mock.instances[0] as unknown as typeof adapterInstance;

    // Restore default return values after clearAllMocks
    adapterInstance.getPlaybackState.mockReturnValue({
      title: null,
      artist: null,
      isPlaying: false,
    });
    adapterInstance.clickQuickPicksPlayAll.mockReturnValue(false);
  });

  afterEach(() => {
    controller.destroy();
    vi.useRealTimers();
  });

  it("should not trigger play when disabled", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: false });
      },
    );

    controller.init();

    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
    expect(adapterInstance.clickQuickPicksPlayAll).not.toHaveBeenCalled();
  });

  it("should not trigger play when enabled but already playing", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Some Song",
      isPlaying: true,
    });

    // Add play-pause button so the observer triggers immediately
    const btn = document.createElement("button");
    btn.id = "play-pause-button";
    document.body.appendChild(btn);

    controller.init();

    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
    expect(adapterInstance.clickQuickPicksPlayAll).not.toHaveBeenCalled();
  });

  it("should call play when enabled, not playing, and track is loaded", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Some Song",
      isPlaying: false,
    });

    const btn = document.createElement("button");
    btn.id = "play-pause-button";
    document.body.appendChild(btn);

    controller.init();

    expect(adapterInstance.executeAction).toHaveBeenCalledWith("play");
  });

  it("should click Quick Picks when enabled, not playing, and no track loaded", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );

    adapterInstance.getPlaybackState.mockReturnValue({
      title: null,
      isPlaying: false,
    });

    adapterInstance.clickQuickPicksPlayAll.mockReturnValue(true);

    const btn = document.createElement("button");
    btn.id = "play-pause-button";
    document.body.appendChild(btn);

    controller.init();

    expect(adapterInstance.clickQuickPicksPlayAll).toHaveBeenCalled();
    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
  });

  it("should fall back to play action when Quick Picks not found", () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );

    adapterInstance.getPlaybackState.mockReturnValue({
      title: null,
      isPlaying: false,
    });

    adapterInstance.clickQuickPicksPlayAll.mockReturnValue(false);

    const btn = document.createElement("button");
    btn.id = "play-pause-button";
    document.body.appendChild(btn);

    controller.init();

    expect(adapterInstance.clickQuickPicksPlayAll).toHaveBeenCalled();
    expect(adapterInstance.executeAction).toHaveBeenCalledWith("play");
  });

  it("should wait for player bar before acting", async () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );

    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Song",
      isPlaying: false,
    });

    // No play-pause button yet
    controller.init();

    // Should not have acted yet
    expect(adapterInstance.executeAction).not.toHaveBeenCalled();

    // Now add the button (simulates YTM rendering)
    const btn = document.createElement("button");
    btn.id = "play-pause-button";
    document.body.appendChild(btn);

    // MutationObserver callbacks are delivered as microtasks
    await vi.waitFor(() => {
      expect(adapterInstance.executeAction).toHaveBeenCalledWith("play");
    });
  });

  it("should stop observing after timeout", async () => {
    sendMessageMock.mockImplementation(
      (_message: unknown, callback?: (response: unknown) => void) => {
        if (callback) callback({ ok: true, data: true });
      },
    );

    // No play-pause button -- observer will be watching
    controller.init();

    // Advance past the timeout
    vi.advanceTimersByTime(11_000);

    // Now add the button -- should NOT trigger play since timeout passed
    adapterInstance.getPlaybackState.mockReturnValue({
      title: "Song",
      isPlaying: false,
    });

    const btn = document.createElement("button");
    btn.id = "play-pause-button";
    document.body.appendChild(btn);

    // Flush microtasks to confirm observer doesn't fire
    await Promise.resolve();

    expect(adapterInstance.executeAction).not.toHaveBeenCalled();
  });

  it("should listen for set-auto-play-enabled messages", () => {
    controller.init();

    expect(addListenerMock).toHaveBeenCalled();
  });

  it("should clean up on destroy", () => {
    controller.init();
    controller.destroy();

    expect(removeListenerMock).toHaveBeenCalled();
  });
});
