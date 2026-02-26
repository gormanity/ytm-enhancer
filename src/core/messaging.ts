/** Base message envelope. All messages must have a type. */
export interface Message {
  type: string;
  [key: string]: unknown;
}

/** Standard response envelope. */
export type MessageResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

export interface SendOptions {
  tabId?: number;
}

type MessageHandler = (
  message: Message,
  sender: chrome.runtime.MessageSender,
) => Promise<MessageResponse>;

/** Create a function for sending messages to background or tabs. */
export function createMessageSender() {
  return async (
    message: Message,
    options?: SendOptions,
  ): Promise<MessageResponse> => {
    if (options?.tabId !== undefined) {
      return chrome.tabs.sendMessage(options.tabId, message);
    }
    return chrome.runtime.sendMessage(message);
  };
}

/** Create a message handler that dispatches by message type. */
export function createMessageHandler() {
  const handlers = new Map<string, MessageHandler>();
  let listener:
    | ((
        message: Message,
        sender: chrome.runtime.MessageSender,
        sendResponse: (response: MessageResponse) => void,
      ) => boolean)
    | null = null;

  return {
    on(type: string, handler: MessageHandler): void {
      handlers.set(type, handler);
    },

    start(): void {
      listener = (message, sender, sendResponse) => {
        const handler = handlers.get(message.type);

        if (!handler) {
          sendResponse({
            ok: false,
            error: `No handler for message type: "${message.type}"`,
          });
          return true;
        }

        handler(message, sender)
          .then(sendResponse)
          .catch((err: Error) => {
            sendResponse({ ok: false, error: err.message });
          });

        return true;
      };

      chrome.runtime.onMessage.addListener(listener);
    },

    stop(): void {
      if (listener) {
        chrome.runtime.onMessage.removeListener(listener);
        listener = null;
      }
    },
  };
}
