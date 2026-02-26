import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMessageSender,
  createMessageHandler,
  type Message,
  type MessageResponse,
} from "@/core/messaging";

describe("messaging", () => {
  beforeEach(() => {
    vi.stubGlobal("chrome", {
      runtime: {
        sendMessage: vi.fn(),
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
      tabs: {
        sendMessage: vi.fn(),
        query: vi.fn(),
      },
    });
  });

  describe("createMessageSender", () => {
    it("should send a message via chrome.runtime.sendMessage", async () => {
      const response: MessageResponse = { ok: true, data: "pong" };
      vi.mocked(
        chrome.runtime.sendMessage as () => Promise<MessageResponse>,
      ).mockResolvedValue(response);

      const send = createMessageSender();
      const result = await send({ type: "ping" });

      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: "ping",
      });
      expect(result).toEqual(response);
    });

    it("should send a message to a specific tab", async () => {
      const response: MessageResponse = { ok: true, data: "done" };
      vi.mocked(
        chrome.tabs.sendMessage as () => Promise<MessageResponse>,
      ).mockResolvedValue(response);

      const send = createMessageSender();
      const result = await send({ type: "exec", action: "play" }, { tabId: 5 });

      expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(5, {
        type: "exec",
        action: "play",
      });
      expect(result).toEqual(response);
    });
  });

  describe("createMessageHandler", () => {
    it("should register a handler for a message type", () => {
      const handler = createMessageHandler();
      const callback = vi.fn();

      handler.on("ping", callback);
      handler.start();

      expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    });

    it("should dispatch messages to the correct handler", async () => {
      const handler = createMessageHandler();
      const pingHandler = vi.fn().mockResolvedValue({ ok: true, data: "pong" });

      handler.on("ping", pingHandler);
      handler.start();

      const registeredListener = vi.mocked(chrome.runtime.onMessage.addListener)
        .mock.calls[0][0];

      const sendResponse = vi.fn();
      const result = registeredListener(
        { type: "ping" } as Message,
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      // Should return true to indicate async response
      expect(result).toBe(true);

      // Wait for async handler
      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: "pong" });
      });
    });

    it("should respond with error for unhandled message types", async () => {
      const handler = createMessageHandler();
      handler.start();

      const registeredListener = vi.mocked(chrome.runtime.onMessage.addListener)
        .mock.calls[0][0];

      const sendResponse = vi.fn();
      registeredListener(
        { type: "unknown" } as Message,
        {} as chrome.runtime.MessageSender,
        sendResponse,
      );

      await vi.waitFor(() => {
        expect(sendResponse).toHaveBeenCalledWith({
          ok: false,
          error: 'No handler for message type: "unknown"',
        });
      });
    });

    it("should remove listener on stop", () => {
      const handler = createMessageHandler();
      handler.start();
      handler.stop();

      expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
    });
  });
});
