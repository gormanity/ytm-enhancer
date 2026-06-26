import { expect, test } from "playwright/test";
import { launchExtensionContext } from "./helpers/extension-context";

// Playwright requires the first callback parameter to be a destructured fixture object.
// eslint-disable-next-line no-empty-pattern
test("renders the extension popup shell", async ({}, testInfo) => {
  test.skip(
    testInfo.project.name === "firefox",
    "Firefox extension E2E needs a temporary add-on loading harness.",
  );

  const extension = await launchExtensionContext(testInfo);
  try {
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
  test.skip(
    testInfo.project.name === "firefox",
    "Firefox extension E2E needs a temporary add-on loading harness.",
  );

  const extension = await launchExtensionContext(testInfo);
  const pageErrors: string[] = [];
  extension.popup.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });

  try {
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
