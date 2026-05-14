import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright/test";

type PlaybackActionMessage = {
  type: "playback-action";
  action: "togglePlay" | "play" | "pause" | "next" | "previous";
};

declare global {
  interface Window {
    __ytmEnhancerDispatchRuntimeMessage?: (
      message: PlaybackActionMessage,
    ) => Promise<unknown>;
    __ytmTestEvents?: string[];
  }
}

export async function installContentScriptHarness(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const runtimeListeners: Array<
      (
        message: unknown,
        sender: unknown,
        sendResponse: (response: unknown) => void,
      ) => boolean | void | Promise<unknown>
    > = [];

    window.chrome = {
      runtime: {
        onMessage: {
          addListener: (listener: (typeof runtimeListeners)[number]) => {
            runtimeListeners.push(listener);
          },
          removeListener: (listener: (typeof runtimeListeners)[number]) => {
            const index = runtimeListeners.indexOf(listener);
            if (index >= 0) runtimeListeners.splice(index, 1);
          },
        },
        sendMessage: () => undefined,
      },
    } as unknown as typeof chrome;

    window.__ytmEnhancerDispatchRuntimeMessage = async (message) => {
      const responses: unknown[] = [];
      for (const listener of runtimeListeners) {
        const result = listener(message, {}, (response) => {
          responses.push(response);
        });
        if (result instanceof Promise) {
          responses.push(await result);
        }
      }
      return responses.at(-1) ?? null;
    };
  });
}

export type E2EBrowserTarget = "chrome" | "edge" | "firefox";

export function browserTargetFromProjectName(
  projectName: string,
): E2EBrowserTarget {
  if (projectName === "firefox") return "firefox";
  if (projectName === "edge") return "edge";
  return "chrome";
}

export async function injectBuiltContentScript(
  page: Page,
  browserTarget: E2EBrowserTarget,
): Promise<void> {
  const contentScript = await readFile(
    resolve(process.cwd(), "dist-dev", browserTarget, "content.js"),
    "utf-8",
  );
  await page.addScriptTag({ content: contentScript });
}
