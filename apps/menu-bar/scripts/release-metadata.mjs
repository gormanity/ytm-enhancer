import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function readReleaseMetadata() {
  const metadata = JSON.parse(
    readFileSync(resolve(appRoot, "release/metadata.json"), "utf-8"),
  );

  return {
    ...metadata,
    appcastUrl: process.env.YTM_MENU_BAR_APPCAST_URL ?? metadata.appcastUrl,
    buildNumber: process.env.YTM_MENU_BAR_BUILD_NUMBER ?? metadata.buildNumber,
    version: process.env.YTM_MENU_BAR_VERSION ?? metadata.version,
  };
}
