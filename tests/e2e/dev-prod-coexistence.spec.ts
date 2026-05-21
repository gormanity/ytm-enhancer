import { expect, test } from "playwright/test";
import { launchExtensionContext } from "./helpers/extension-context";
import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_LOCAL_PROD_EXTENSION_ID,
} from "../../src/runtime-messages";

test("prod popup is disabled by dev presence without a YouTube Music tab", async (// Playwright requires the first callback parameter to be a fixture object.
// eslint-disable-next-line no-empty-pattern
{}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chromium fixed-ID coexistence coverage uses Chrome unpacked builds.",
  );

  const extension = await launchExtensionContext(testInfo, "prod-and-dev");
  try {
    expect(extension.extensionIds).toContain(CHROMIUM_LOCAL_PROD_EXTENSION_ID);
    expect(extension.extensionIds).toContain(CHROMIUM_LOCAL_DEV_EXTENSION_ID);
    await expect(
      extension.popup.locator("#dev-build-conflict-banner"),
    ).toBeVisible();
  } finally {
    await extension.context.close();
  }
});
