import type { PlaybackAction, PlaybackState } from "./types";
import type { Message, MessageResponse, SendOptions } from "./messaging";

export type MessageSender = (
  message: Message,
  options?: SendOptions,
) => Promise<MessageResponse>;

/** Executes playback actions by sending messages to content scripts. */
export class ActionExecutor {
  private send: MessageSender;

  constructor(send: MessageSender) {
    this.send = send;
  }

  async execute(action: PlaybackAction, tabId: number): Promise<void> {
    const response = await this.send(
      { type: "playback-action", action },
      { tabId },
    );

    if (!response.ok) {
      throw new Error(response.error);
    }
  }

  async getPlaybackState(tabId: number): Promise<PlaybackState> {
    const response = await this.send({ type: "get-playback-state" }, { tabId });

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response.data as PlaybackState;
  }
}
