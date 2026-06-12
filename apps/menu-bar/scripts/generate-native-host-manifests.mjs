#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const NATIVE_HOST_NAME = "com.gormanity.ytm_enhancer.menu_bar";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const metadata = JSON.parse(
  readFileSync(resolve(appRoot, "release/metadata.json"), "utf-8"),
);

const productionExecutablePath =
  "/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector";
const chromiumOrigins = [
  "chrome-extension://bilcedjabgiedoamakekncokccabdccp/",
];
const firefoxExtensions = ["ytm-enhancer@gormanity"];

function hostManifest({ allowedOrigins, allowedExtensions }) {
  if (metadata.nativeHostExecutablePath !== productionExecutablePath) {
    throw new Error(
      "Native host executable path does not match release metadata",
    );
  }

  const manifest = {
    name: NATIVE_HOST_NAME,
    description: "YTM Enhancer Menu Bar Connector",
    path: productionExecutablePath,
    type: "stdio",
  };

  if (allowedOrigins) {
    manifest.allowed_origins = allowedOrigins;
  }
  if (allowedExtensions) {
    manifest.allowed_extensions = allowedExtensions;
  }

  return manifest;
}

export function createNativeHostManifests() {
  return new Map([
    [
      "Library/Google/Chrome/NativeMessagingHosts",
      hostManifest({ allowedOrigins: chromiumOrigins }),
    ],
    [
      "Library/Application Support/Chromium/NativeMessagingHosts",
      hostManifest({ allowedOrigins: chromiumOrigins }),
    ],
    [
      "Library/Application Support/Mozilla/NativeMessagingHosts",
      hostManifest({ allowedExtensions: firefoxExtensions }),
    ],
  ]);
}

export function writeNativeHostManifests(outputRoot) {
  for (const [directory, manifest] of createNativeHostManifests()) {
    const targetDirectory = resolve(outputRoot, directory);
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(
      join(targetDirectory, `${NATIVE_HOST_NAME}.json`),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputRoot = resolve(
    process.argv[2] ?? join(appRoot, ".build/release-root"),
  );
  writeNativeHostManifests(outputRoot);
  console.log(`Wrote production native host manifests to ${outputRoot}`);
}
