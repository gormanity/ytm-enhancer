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
  const action = message.action as PlaybackAction;

  if (message.action === "seekTo") {
    if (typeof message.time !== "number") {
      return { ok: false, error: "Invalid seek time" };
    }
    const activated = await ytm.seekTo(message.time, target);
    if (!activated) {
      return {
        ok: false,
        error: "YouTube Music did not expose a seek control",
      };
    }
    return { ok: true };
  }

  const activated = await ytm.executePlaybackAction(action, target);
  if (!activated) {
    return {
      ok: false,
      error: `YouTube Music did not expose a control for ${action}`,
    };
  }
  return { ok: true };
}
