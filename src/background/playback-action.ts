import type { Message, MessageResponse } from "@/core/messaging";
import type { PlaybackAction } from "@/core/types";
import type { YtmRuntimeClient, YtmTarget } from "@/core/ytm-client";

function getTarget(
  message: Message,
  sender: chrome.runtime.MessageSender,
): YtmTarget | undefined {
  if (typeof message.tabId === "number") {
    return { kind: "tab", tabId: message.tabId };
  }

  if (typeof sender.tab?.id === "number") {
    return { kind: "tab", tabId: sender.tab.id };
  }

  return undefined;
}

export async function handlePlaybackActionMessage(
  message: Message,
  sender: chrome.runtime.MessageSender,
  ytm: YtmRuntimeClient,
): Promise<MessageResponse> {
  const target = getTarget(message, sender);

  if (message.action === "seekTo") {
    if (typeof message.time !== "number") {
      return { ok: false, error: "Invalid seek time" };
    }
    await ytm.seekTo(message.time, target);
    return { ok: true };
  }

  await ytm.executePlaybackAction(message.action as PlaybackAction, target);
  return { ok: true };
}
