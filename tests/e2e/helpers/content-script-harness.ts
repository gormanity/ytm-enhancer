import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright/test";

export type RuntimeTestMessage = {
  type: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    __ytmEnhancerDispatchRuntimeMessage?: (
      message: RuntimeTestMessage,
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
        let resolveResponse: (response: unknown) => void = () => undefined;
        const responsePromise = new Promise<unknown>((resolve) => {
          resolveResponse = resolve;
        });
        let sentResponse = false;

        const result = listener(message, {}, (response) => {
          sentResponse = true;
          responses.push(response);
          resolveResponse(response);
        });

        if (result instanceof Promise) {
          responses.push(await result);
          continue;
        }

        if (result === true) {
          const response = await responsePromise;
          if (!sentResponse) responses.push(response);
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

export async function dispatchRuntimeMessage(
  page: Page,
  message: RuntimeTestMessage,
): Promise<unknown> {
  return page.evaluate(async (runtimeMessage) => {
    return window.__ytmEnhancerDispatchRuntimeMessage?.(runtimeMessage);
  }, message);
}
