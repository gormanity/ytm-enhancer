import {
  CHROMIUM_LOCAL_DEV_EXTENSION_ID,
  CHROMIUM_LOCAL_DEV_KEY,
  CHROMIUM_LOCAL_PROD_KEY,
  CHROMIUM_PROD_EXTENSION_IDS,
} from "./runtime-messages";

export function applyChromiumCoexistenceManifestFields(
  manifest: Record<string, unknown>,
  browser: string,
  isDev: boolean,
): void {
  if (browser !== "chrome") return;

  manifest.key = isDev ? CHROMIUM_LOCAL_DEV_KEY : CHROMIUM_LOCAL_PROD_KEY;
  manifest.externally_connectable = {
    ids: isDev
      ? [...CHROMIUM_PROD_EXTENSION_IDS]
      : [CHROMIUM_LOCAL_DEV_EXTENSION_ID],
  };
}
