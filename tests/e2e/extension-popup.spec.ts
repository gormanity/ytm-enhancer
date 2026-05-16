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
