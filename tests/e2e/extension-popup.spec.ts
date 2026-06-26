import { expect, test } from "playwright/test";
import {
  launchExtensionContext,
  type ExtensionTestContext,
} from "./helpers/extension-context";

interface FirefoxPopupShellSnapshot {
  activeLabel: string;
  playbackControlsVisible: boolean;
  title: string;
}

interface FirefoxPopupNavigationSnapshot {
  activeLabels: string[];
  labels: string[];
}

interface FirefoxConnectedAppsToggleSnapshot {
  checked: boolean;
  unchecked: boolean;
}

interface FirefoxConnectedAppsCardSnapshot {
  count: number;
  openStates: boolean[];
}

function requireFirefoxController(extension: ExtensionTestContext) {
  if (!extension.firefox) {
    throw new Error("Expected Firefox extension controller.");
  }
  return extension.firefox;
}

async function expectFirefoxPopupShell(
  extension: ExtensionTestContext,
): Promise<void> {
  const firefox = requireFirefoxController(extension);
  const snapshot = await firefox.evaluatePopup<FirefoxPopupShellSnapshot>(`
const text = (element) => element?.textContent?.trim() ?? "";
const headingVisible = Array.from(document.querySelectorAll("h1, h2, h3"))
  .some((element) => text(element) === "Playback Controls");
return {
  activeLabel: text(document.querySelector(".nav-item.active [data-role='label']")),
  playbackControlsVisible: headingVisible,
  title: text(document.querySelector('[data-role="app-title"]')),
};
`);

  expect(snapshot).toEqual({
    activeLabel: "Playback Controls",
    playbackControlsVisible: true,
    title: "YTM EnhancerDEV",
  });
}

async function expectFirefoxPopupNavigation(
  extension: ExtensionTestContext,
): Promise<void> {
  const firefox = requireFirefoxController(extension);
  const snapshot = await firefox.evaluatePopup<FirefoxPopupNavigationSnapshot>(`
const text = (element) => element?.textContent?.trim() ?? "";
const labels = Array.from(
  document.querySelectorAll(".nav-item [data-role='label']"),
  text,
);
const activeLabels = [];

for (const label of labels) {
  const item = Array.from(document.querySelectorAll(".nav-item"))
    .find((node) => text(node.querySelector("[data-role='label']")) === label);
  if (!item) throw new Error("Missing nav item " + label);

  item.click();
  activeLabels.push(
    text(document.querySelector(".nav-item.active [data-role='label']")),
  );
}

return { activeLabels, labels };
`);

  expect(snapshot.labels).toContain("Connected Apps");
  expect(snapshot.activeLabels).toEqual(snapshot.labels);
}

async function openFirefoxConnectedAppsView(
  extension: ExtensionTestContext,
): Promise<void> {
  const firefox = requireFirefoxController(extension);
  await firefox.evaluatePopup(`
const text = (element) => element?.textContent?.trim() ?? "";
const item = Array.from(document.querySelectorAll(".nav-item"))
  .find((node) => text(node.querySelector("[data-role='label']")) === "Connected Apps");
if (!item) throw new Error("Missing Connected Apps nav item.");
item.click();
return true;
`);
}

async function expectFirefoxConnectedAppsReady(
  extension: ExtensionTestContext,
): Promise<void> {
  const firefox = requireFirefoxController(extension);
  await expect
    .poll(
      () =>
        firefox.evaluatePopup(`
const toggle = document.querySelector('[data-role="connected-apps-enabled-toggle"]');
return {
  cardCount: document.querySelectorAll(".connected-app-card").length,
  toggleReady: toggle instanceof HTMLInputElement && !toggle.disabled,
};
`),
      { timeout: 5_000 },
    )
    .toEqual({ cardCount: 3, toggleReady: true });
}

async function exerciseFirefoxConnectedAppsControls(
  extension: ExtensionTestContext,
): Promise<void> {
  const firefox = requireFirefoxController(extension);
  const toggleSnapshot =
    await firefox.evaluatePopup<FirefoxConnectedAppsToggleSnapshot>(`
const toggle = document.querySelector('[data-role="connected-apps-enabled-toggle"]');
if (!(toggle instanceof HTMLInputElement)) {
  throw new Error("Missing Connected Apps toggle.");
}
if (toggle.disabled) {
  throw new Error("Connected Apps toggle is still disabled.");
}

if (!toggle.checked) toggle.click();
const checked = toggle.checked;
if (toggle.checked) toggle.click();

return { checked, unchecked: !toggle.checked };
`);
  expect(toggleSnapshot).toEqual({ checked: true, unchecked: true });

  const cardSnapshot =
    await firefox.evaluatePopup<FirefoxConnectedAppsCardSnapshot>(`
const cards = Array.from(document.querySelectorAll(".connected-app-card"));
const openStates = cards.map((card) => {
  const summary = card.querySelector("summary");
  if (!summary) throw new Error("Missing connected app card summary.");
  summary.click();
  return card.open === true;
});
return { count: cards.length, openStates };
`);

  expect(cardSnapshot.count).toBe(3);
  expect(cardSnapshot.openStates).toEqual([true, true, true]);
}

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("renders the extension popup shell", async ({}, testInfo) => {
  const extension = await launchExtensionContext(testInfo);
  try {
    if (extension.firefox) {
      await expectFirefoxPopupShell(extension);
      return;
    }

    await expect(extension.popup.locator('[data-role="app-title"]')).toHaveText(
      "YTM EnhancerDEV",
    );
    await expect(
      extension.popup.locator(".nav-item").filter({
        has: extension.popup.locator('[data-role="label"]', {
          hasText: "Playback Controls",
        }),
      }),
    ).toHaveClass(/active/);
    await expect(
      extension.popup.getByRole("heading", { name: "Playback Controls" }),
    ).toBeVisible();
  } finally {
    await extension.context.close();
  }
});

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("supports popup navigation and Connected Apps interactions", async ({}, testInfo) => {
  const extension = await launchExtensionContext(testInfo);
  const pageErrors: string[] = [];
  extension.popup.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });

  try {
    if (extension.firefox) {
      await expectFirefoxPopupNavigation(extension);
      await openFirefoxConnectedAppsView(extension);
      await expectFirefoxConnectedAppsReady(extension);
      await exerciseFirefoxConnectedAppsControls(extension);
      expect(extension.popup.isClosed()).toBe(false);
      expect(pageErrors).toEqual([]);
      return;
    }

    const navLabels = await extension.popup
      .locator(".nav-item [data-role='label']")
      .allTextContents();
    expect(navLabels).toContain("Connected Apps");

    for (const label of navLabels) {
      await extension.popup.locator(".nav-item", { hasText: label }).click();
      await expect(
        extension.popup.locator(".nav-item", { hasText: label }),
      ).toHaveClass(/active/);
    }

    await extension.popup
      .locator(".nav-item", { hasText: "Connected Apps" })
      .click();
    const toggle = extension.popup.getByLabel("Enable Connected Apps");
    await expect(toggle).toBeVisible();

    await toggle.check();
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();

    const cards = extension.popup.locator(".connected-app-card");
    await expect(cards).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      const card = cards.nth(index);
      await card.locator("summary").click();
      await expect(card).toHaveJSProperty("open", true);
    }

    expect(extension.popup.isClosed()).toBe(false);
    expect(pageErrors).toEqual([]);
  } finally {
    await extension.context.close();
  }
});
