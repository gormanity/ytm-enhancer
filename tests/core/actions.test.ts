import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionExecutor, type MessageSender } from "@/core/actions";
import type { PlaybackAction } from "@/core/types";
import type { MessageResponse } from "@/core/messaging";

describe("ActionExecutor", () => {
  let sendMock: ReturnType<typeof vi.fn<MessageSender>>;
  let executor: ActionExecutor;

  beforeEach(() => {
    sendMock = vi.fn<MessageSender>();
    executor = new ActionExecutor(sendMock);
  });

  it("should send an action message to a specific tab", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);

    await executor.execute("play", 42);

    expect(sendMock).toHaveBeenCalledWith(
      { type: "playback-action", action: "play" },
      { tabId: 42 },
    );
  });

  it("should support all playback actions", async () => {
    sendMock.mockResolvedValue({ ok: true } as MessageResponse);

    const actions: PlaybackAction[] = [
      "play",
      "pause",
      "next",
      "previous",
      "togglePlay",
    ];

    for (const action of actions) {
      await executor.execute(action, 1);
      expect(sendMock).toHaveBeenCalledWith(
        { type: "playback-action", action },
        { tabId: 1 },
      );
    }
  });

  it("should throw when the response indicates failure", async () => {
    sendMock.mockResolvedValue({
      ok: false,
      error: "Tab not found",
    } as MessageResponse);

    await expect(executor.execute("play", 99)).rejects.toThrow("Tab not found");
  });

  it("should request playback state from a tab", async () => {
    const mockState = {
      title: "Song",
      artist: "Artist",
      isPlaying: true,
    };
    sendMock.mockResolvedValue({
      ok: true,
      data: mockState,
    } as MessageResponse);

    const state = await executor.getPlaybackState(42);

    expect(sendMock).toHaveBeenCalledWith(
      { type: "get-playback-state" },
      { tabId: 42 },
    );
    expect(state).toEqual(mockState);
  });
});
