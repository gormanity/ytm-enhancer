import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Page } from "playwright/test";

export type RuntimeTestMessage = {
  type: string;
  [key: string]: unknown;
};

export type RuntimeMessageResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

declare global {
  interface Window {
    __ytmEnhancerDispatchRuntimeMessage?: (
      message: RuntimeTestMessage,
    ) => Promise<unknown>;
    __ytmEnhancerRuntimeMessages?: RuntimeTestMessage[];
    __ytmEnhancerRuntimeResponses?: Record<string, RuntimeMessageResponse>;
    __ytmTestEvents?: string[];
  }
}

export async function installContentScriptHarness(
  page: Page,
  runtimeResponses: Record<string, RuntimeMessageResponse> = {},
): Promise<void> {
  await page.addInitScript((initialRuntimeResponses) => {
    window.__ytmEnhancerRuntimeMessages = [];
    window.__ytmEnhancerRuntimeResponses = {
      "get-auto-play-mode": { ok: true, data: "default" },
      ...initialRuntimeResponses,
    };

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
        sendMessage: (
          message: RuntimeTestMessage,
          callback?: (response: RuntimeMessageResponse) => void,
        ) => {
          window.__ytmEnhancerRuntimeMessages?.push(message);
          const response = window.__ytmEnhancerRuntimeResponses?.[
            message.type
          ] ?? {
            ok: true,
          };
          callback?.(response);
          return undefined;
        },
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
  }, runtimeResponses);
}

export async function setRuntimeResponse(
  page: Page,
  type: string,
  response: RuntimeMessageResponse,
): Promise<void> {
  await page.evaluate(
    ({ responseType, runtimeResponse }) => {
      window.__ytmEnhancerRuntimeResponses ??= {};
      window.__ytmEnhancerRuntimeResponses[responseType] = runtimeResponse;
    },
    { responseType: type, runtimeResponse: response },
  );
}

export async function readRuntimeMessages(
  page: Page,
): Promise<RuntimeTestMessage[]> {
  return page.evaluate(() => window.__ytmEnhancerRuntimeMessages ?? []);
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
