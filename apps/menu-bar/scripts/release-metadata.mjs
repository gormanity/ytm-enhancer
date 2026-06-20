import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function localBuildVersion(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    `${pad(date.getHours())}${pad(date.getMinutes())}`,
  ].join(".");
}

function localBuildNumber(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
}

export function readReleaseMetadata() {
  const metadata = JSON.parse(
    readFileSync(resolve(appRoot, "release/metadata.json"), "utf-8"),
  );
  const useLocalBuildVersion = process.env.YTM_MENU_BAR_LOCAL_BUILD === "1";
  const localBuildDate = new Date();
  const version =
    process.env.YTM_MENU_BAR_VERSION ??
    (useLocalBuildVersion
      ? localBuildVersion(localBuildDate)
      : metadata.version);
  const buildNumber =
    process.env.YTM_MENU_BAR_BUILD_NUMBER ??
    (useLocalBuildVersion
      ? localBuildNumber(localBuildDate)
      : metadata.buildNumber);
  const displayVersion =
    useLocalBuildVersion && !process.env.YTM_MENU_BAR_VERSION
      ? `${version} (base v${metadata.version})`
      : version;

  return {
    ...metadata,
    appcastUrl: process.env.YTM_MENU_BAR_APPCAST_URL ?? metadata.appcastUrl,
    baseBuildNumber: metadata.buildNumber,
    baseVersion: metadata.version,
    buildNumber,
    displayVersion,
    isLocalBuild: useLocalBuildVersion,
    version,
  };
}
