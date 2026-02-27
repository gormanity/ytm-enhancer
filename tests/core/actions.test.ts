import { describe, it, expect, vi, beforeEach } from "vitest";
import { ActionExecutor, type MessageSender } from "@/core/actions";
import type { PlaybackAction } from "@/core/types";
import type { MessageResponse } from "@/core/messaging";

const CONNECTION_ERROR =
  "Could not establish connection. Receiving end does not exist.";

describe("ActionExecutor", () => {
  let sendMock: ReturnType<typeof vi.fn<MessageSender>>;
  let executor: ActionExecutor;

  beforeEach(() => {
    sendMock = vi.fn<MessageSender>();
    executor = new ActionExecutor(sendMock);

    vi.stubGlobal("chrome", {
      scripting: {
        executeScript: vi.fn().mockResolvedValue(undefined),
      },
    });
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

  describe("content script injection fallback", () => {
    it("should inject the content script and retry on connection error in execute", async () => {
      sendMock
        .mockRejectedValueOnce(new Error(CONNECTION_ERROR))
        .mockResolvedValueOnce({ ok: true } as MessageResponse);

      await executor.execute("play", 42);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ["content.js"],
      });
      expect(sendMock).toHaveBeenCalledTimes(2);
    });

    it("should inject the content script and retry on connection error in getPlaybackState", async () => {
      const mockState = {
        title: "Song",
        artist: "Artist",
        isPlaying: true,
      };
      sendMock
        .mockRejectedValueOnce(new Error(CONNECTION_ERROR))
        .mockResolvedValueOnce({
          ok: true,
          data: mockState,
        } as MessageResponse);

      const state = await executor.getPlaybackState(42);

      expect(chrome.scripting.executeScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ["content.js"],
      });
      expect(sendMock).toHaveBeenCalledTimes(2);
      expect(state).toEqual(mockState);
    });

    it("should propagate non-connection errors without retry", async () => {
      sendMock.mockRejectedValueOnce(new Error("Some other error"));

      await expect(executor.execute("play", 42)).rejects.toThrow(
        "Some other error",
      );

      expect(chrome.scripting.executeScript).not.toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalledTimes(1);
    });
  });
});
