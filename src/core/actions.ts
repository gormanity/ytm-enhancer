import type { PlaybackAction, PlaybackState } from "./types";
import type { Message, MessageResponse, SendOptions } from "./messaging";

export type MessageSender = (
  message: Message,
  options?: SendOptions,
) => Promise<MessageResponse>;

const CONNECTION_ERROR =
  "Could not establish connection. Receiving end does not exist.";

/** Executes playback actions by sending messages to content scripts. */
export class ActionExecutor {
  private send: MessageSender;

  constructor(send: MessageSender) {
    this.send = send;
  }

  async execute(action: PlaybackAction, tabId: number): Promise<void> {
    const response = await this.sendToTab(
      { type: "playback-action", action },
      tabId,
    );

    if (!response.ok) {
      throw new Error(response.error);
    }
  }

  async getPlaybackState(tabId: number): Promise<PlaybackState> {
    const response = await this.sendToTab(
      { type: "get-playback-state" },
      tabId,
    );

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response.data as PlaybackState;
  }

  private async sendToTab(
    message: Message,
    tabId: number,
  ): Promise<MessageResponse> {
    try {
      return await this.send(message, { tabId });
    } catch (error) {
      if (error instanceof Error && error.message === CONNECTION_ERROR) {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ["content.js"],
        });
        return this.send(message, { tabId });
      }
      throw error;
    }
  }
}
