import {
  addRuntimeMessageListener,
  removeRuntimeMessageListener,
} from "./runtime-listener";

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

export interface RuntimeClient {
  request<TData = unknown>(message: Message): Promise<TData>;
  command(message: Message): Promise<void>;
  subscribe(
    listener: (message: Message, sender: chrome.runtime.MessageSender) => void,
  ): () => void;
}

export interface ModuleHandlerRegistry {
  on(type: string, handler: MessageHandler): void;
}

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

export function createRuntimeClient(): RuntimeClient {
  return {
    async request<TData = unknown>(message: Message): Promise<TData> {
      const response = (await chrome.runtime.sendMessage(
        message,
      )) as MessageResponse;
      if (!response.ok) throw new Error(response.error);
      return response.data as TData;
    },

    async command(message: Message): Promise<void> {
      const response = (await chrome.runtime.sendMessage(
        message,
      )) as MessageResponse;
      if (!response.ok) throw new Error(response.error);
    },

    subscribe(listener) {
      addRuntimeMessageListener(listener);
      return () => removeRuntimeMessageListener(listener);
    },
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
  let readyGate: (() => Promise<unknown>) | null = null;

  return {
    on(type: string, handler: MessageHandler): void {
      handlers.set(type, handler);
    },

    /**
     * Optional gate that delays message dispatch until the returned promise
     * resolves. Used to ensure persisted state is loaded before answering
     * `get-*` queries that would otherwise return uninitialized defaults.
     */
    setReadyGate(gate: () => Promise<unknown>): void {
      readyGate = gate;
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

        const dispatch = async () => {
          if (readyGate) await readyGate();
          return handler(message, sender);
        };

        dispatch()
          .then(sendResponse)
          .catch((err: Error) => {
            sendResponse({ ok: false, error: err.message });
          });

        return true;
      };

      if (!addRuntimeMessageListener(listener)) {
        listener = null;
      }
    },

    stop(): void {
      if (listener === null) return;

      removeRuntimeMessageListener(listener);
      listener = null;
    },
  };
}
