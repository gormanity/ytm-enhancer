import { expect, test } from "playwright/test";
import type { ConnectedAppsSettings } from "../../src/core/connectors/client";
import { FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID } from "../../src/core/connectors/settings";
import {
  launchExtensionContext,
  type ExtensionTestContext,
} from "./helpers/extension-context";

const CONTENTION_ENV = "YTME_E2E_WINDOWS_TRAY_CONTENTION";
const OWNER_LABEL_ENV = "YTME_WINDOWS_TRAY_CONTENTION_OWNER_LABEL";
const DEFAULT_OWNER_LABEL = "Microsoft Edge (dev)";

interface TrayCardSnapshot {
  guidance: string;
  reconnect: string | null;
  status: string;
}

function contentionSmokeEnabled(): boolean {
  return process.env[CONTENTION_ENV] === "1";
}

function expectedOwnerLabel(): string {
  return process.env[OWNER_LABEL_ENV]?.trim() || DEFAULT_OWNER_LABEL;
}

function expectedBusyMessage(): string {
  return `YTM Tray is already connected to ${expectedOwnerLabel()}. Disconnect that browser before connecting here.`;
}

function requireFirefox(extension: ExtensionTestContext) {
  if (!extension.firefox) {
    throw new Error("Expected Firefox extension controller.");
  }
  return extension.firefox;
}

async function readConnectedAppsSettings(
  extension: ExtensionTestContext,
): Promise<ConnectedAppsSettings> {
  const response = await requireFirefox(extension).sendRuntimeMessage<
    { ok: true; data: ConnectedAppsSettings } | { ok: false; error: string }
  >({
    type: "get-connected-apps-settings",
  });

  if (!response.ok) {
    throw new Error(response.error);
  }

  return response.data;
}

async function enableConnectedApps(
  extension: ExtensionTestContext,
): Promise<void> {
  const response = await requireFirefox(extension).sendRuntimeMessage<
    { ok: true } | { ok: false; error: string }
  >({
    type: "set-connected-apps-enabled",
    enabled: true,
  });

  if (!response.ok) {
    throw new Error(response.error);
  }
}

async function openConnectedAppsView(
  extension: ExtensionTestContext,
): Promise<void> {
  await requireFirefox(extension).evaluatePopup(`
const text = (element) => element?.textContent?.trim() ?? "";
const item = Array.from(document.querySelectorAll(".nav-item"))
  .find((node) => text(node.querySelector("[data-role='label']")) === "Connected Apps");
if (!item) throw new Error("Missing Connected Apps nav item.");
item.click();
return true;
`);
}

async function readTrayCard(
  extension: ExtensionTestContext,
): Promise<TrayCardSnapshot | null> {
  return requireFirefox(extension).evaluatePopup<TrayCardSnapshot | null>(
    `
const text = (element) => element?.textContent?.trim() ?? "";
const card = document.querySelector(
  '[data-app-id="${FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID}"]',
);
if (!card) return null;

return {
  guidance: text(card.querySelector('[data-role="connected-app-guidance"]')),
  reconnect: text(card.querySelector('[data-role="connected-app-reconnect-button"]')) || null,
  status: text(card.querySelector('[data-role="connected-app-status"]')),
};
`,
  );
}

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("reports another browser owning the Windows tray connection in Firefox", async ({}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(
    !contentionSmokeEnabled(),
    `Set ${CONTENTION_ENV}=1 to run the Windows tray contention smoke.`,
  );
  test.skip(
    process.platform !== "win32",
    "The Windows tray contention smoke requires the Windows native host.",
  );
  test.skip(
    testInfo.project.name !== "firefox",
    "The Windows tray contention smoke is scoped to Firefox.",
  );

  let extension: ExtensionTestContext | undefined;

  try {
    extension = await launchExtensionContext(testInfo);

    await enableConnectedApps(extension);

    await expect
      .poll(
        async () => {
          const settings = await readConnectedAppsSettings(extension!);
          const trayApp = settings.firstPartyApps.find(
            (app) => app.id === FIRST_PARTY_WINDOWS_TRAY_CONNECTOR_ID,
          );

          return {
            availability: trayApp?.availability,
            enabled: settings.enabled,
            lastError: trayApp?.lastError,
          };
        },
        { timeout: 20_000 },
      )
      .toEqual({
        availability: "error",
        enabled: true,
        lastError: expectedBusyMessage(),
      });

    await openConnectedAppsView(extension);

    await expect
      .poll(() => readTrayCard(extension!), { timeout: 10_000 })
      .toEqual({
        guidance: expectedBusyMessage(),
        reconnect: "Retry Tray",
        status: "Already Connected",
      });
  } finally {
    await extension?.context.close();
  }
});
