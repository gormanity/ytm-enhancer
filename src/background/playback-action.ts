import type { Message, MessageResponse } from "@/core/messaging";
import type { PlaybackAction } from "@/core/types";
import type { YtmRuntimeClient, YtmTarget } from "@/core/ytm-client";
import { debug } from "@/core/logger";

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
  const startedAt = performance.now();
  const action = message.action as PlaybackAction;
  const traceId =
    typeof message.traceId === "string" ? message.traceId : undefined;
  const source =
    typeof message.source === "string" ? message.source : "unknown";

  debug("PlaybackAction: background received", {
    traceId,
    source,
    action: message.action,
    senderTabId: sender.tab?.id ?? null,
    explicitTabId: typeof message.tabId === "number" ? message.tabId : null,
    target,
  });

  if (message.action === "seekTo") {
    if (typeof message.time !== "number") {
      debug("PlaybackAction: background rejected seek", {
        traceId,
        source,
        reason: "invalid seek time",
      });
      return { ok: false, error: "Invalid seek time" };
    }
    await ytm.seekTo(message.time, target);
    debug("PlaybackAction: background completed seek", {
      traceId,
      source,
      target,
      elapsedMs: Math.round(performance.now() - startedAt),
    });
    return { ok: true };
  }

  await ytm.executePlaybackAction(action, target);
  debug("PlaybackAction: background completed action", {
    traceId,
    source,
    action,
    target,
    elapsedMs: Math.round(performance.now() - startedAt),
  });
  return { ok: true };
}
