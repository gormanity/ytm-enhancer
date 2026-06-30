#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function argValues(name) {
  const prefix = `--${name}=`;
  return process.argv
    .filter((arg) => arg.startsWith(prefix))
    .map((arg) => arg.slice(prefix.length));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function releasePageUrl(tag) {
  return `https://github.com/gormanity/ytm-enhancer/releases/tag/${tag}`;
}

function releaseDownloadUrl({ releaseBaseUrl, tag, packageName }) {
  return `${releaseBaseUrl}/${tag}/${packageName}`;
}

function runtimeFromPackageName(name, metadata) {
  const match = name.match(/-(win-(?:x64|arm64))\.zip$/);
  if (!match || !metadata.runtimes.includes(match[1])) {
    throw new Error(`Cannot infer Windows runtime from package: ${name}`);
  }
  return match[1];
}

function numericBuildNumber(value) {
  const buildNumber = Number(value);
  if (!Number.isSafeInteger(buildNumber) || buildNumber < 0) {
    throw new Error(`Invalid Windows tray build number: ${value}`);
  }
  return buildNumber;
}

export function generateUpdateManifest({
  outputPath = resolve(appRoot, ".build/update-manifest/YTM-Tray-update.json"),
  packagePaths,
  releaseBaseUrl = "https://github.com/gormanity/ytm-enhancer/releases/download",
} = {}) {
  const metadata = readReleaseMetadata();
  const tag = `${metadata.githubReleaseTagPrefix}${metadata.version}`;
  const packages =
    packagePaths?.length > 0
      ? packagePaths
      : metadata.runtimes.map((runtime) =>
          resolve(
            appRoot,
            `.build/packages/${metadata.assetPrefix}-${metadata.version}-${runtime}.zip`,
          ),
        );

  const assets = Object.fromEntries(
    packages.map((path) => {
      const packageName = basename(path);
      const runtime = runtimeFromPackageName(packageName, metadata);
      return [
        runtime,
        {
          name: packageName,
          sha256: sha256(path),
          size: statSync(path).size,
          url: releaseDownloadUrl({ releaseBaseUrl, tag, packageName }),
        },
      ];
    }),
  );

  const manifest = {
    schemaVersion: 1,
    product: "windows-tray",
    name: metadata.appName,
    version: metadata.version,
    buildNumber: numericBuildNumber(metadata.buildNumber),
    tag,
    releaseUrl: releasePageUrl(tag),
    installUrl: metadata.installUrl,
    releaseListUrl: metadata.githubReleaseListUrl,
    minimumWindowsVersion: metadata.minimumWindowsVersion,
    assets,
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return outputPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = generateUpdateManifest({
    outputPath: resolve(
      argValue(
        "output",
        resolve(appRoot, ".build/update-manifest/YTM-Tray-update.json"),
      ),
    ),
    packagePaths: argValues("package").map((path) => resolve(path)),
    releaseBaseUrl: argValue(
      "release-base-url",
      "https://github.com/gormanity/ytm-enhancer/releases/download",
    ),
  });
  console.log(`Wrote Windows tray update manifest to ${outputPath}`);
}
