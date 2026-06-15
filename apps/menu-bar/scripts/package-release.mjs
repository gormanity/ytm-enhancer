#!/usr/bin/env node
import {
  cpSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildReleaseApp } from "./build-release-app.mjs";
import { writeNativeHostManifests } from "./generate-native-host-manifests.mjs";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function run(command, args) {
  execFileSync(command, args.filter(Boolean), { stdio: "inherit" });
}

function verifyRelativeSymlinks(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(path);
      if (target.startsWith("/")) {
        throw new Error(`Package payload symlink must be relative: ${path}`);
      }
      continue;
    }

    if (stat.isDirectory()) {
      verifyRelativeSymlinks(path);
    }
  }
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function writeAppComponentPlist(path, appName) {
  const rootRelativeBundlePath = `Applications/${appName}.app`;
  writeFileSync(
    path,
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
  <dict>
    <key>BundleHasStrictIdentifier</key>
    <true/>
    <key>BundleIsRelocatable</key>
    <false/>
    <key>BundleIsVersionChecked</key>
    <false/>
    <key>BundleOverwriteAction</key>
    <string>upgrade</string>
    <key>RootRelativeBundlePath</key>
    <string>${escapeXml(rootRelativeBundlePath)}</string>
  </dict>
</array>
</plist>
`,
  );
}

export function packageRelease({
  channel = "direct",
  outputRoot = resolve(appRoot, ".build/packages"),
} = {}) {
  const metadata = readReleaseMetadata();

  if (!["direct", "homebrew"].includes(channel)) {
    throw new Error(`Unsupported release channel: ${channel}`);
  }

  const appDirectory = buildReleaseApp({
    channel,
    requireSparklePublicKey: channel === "direct",
  });
  const workRoot = resolve(appRoot, ".build/package-work", channel);
  const appPayloadRoot = join(workRoot, "app-payload");
  const hostPayloadRoot = join(workRoot, "host-payload");
  const componentRoot = join(workRoot, "components");
  const assetPrefix = metadata.channels[channel].assetPrefix;
  const outputPackage = resolve(
    outputRoot,
    `${assetPrefix}-${metadata.version}.pkg`,
  );

  rmSync(workRoot, { recursive: true, force: true });
  mkdirSync(join(appPayloadRoot, "Applications"), { recursive: true });
  mkdirSync(componentRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  cpSync(
    appDirectory,
    join(appPayloadRoot, "Applications", `${metadata.appName}.app`),
    {
      recursive: true,
      verbatimSymlinks: true,
    },
  );
  verifyRelativeSymlinks(
    join(
      appPayloadRoot,
      "Applications",
      `${metadata.appName}.app`,
      "Contents/Frameworks/Sparkle.framework",
    ),
  );
  writeNativeHostManifests(hostPayloadRoot);

  const appComponent = join(componentRoot, "app.pkg");
  const hostComponent = join(componentRoot, "native-hosts.pkg");
  const appComponentPlist = join(componentRoot, "app-components.plist");
  writeAppComponentPlist(appComponentPlist, metadata.appName);

  run("pkgbuild", [
    "--root",
    appPayloadRoot,
    "--install-location",
    "/",
    "--component-plist",
    appComponentPlist,
    "--identifier",
    `${metadata.bundleIdentifier}.app`,
    "--version",
    metadata.version,
    appComponent,
  ]);
  run("pkgbuild", [
    "--root",
    hostPayloadRoot,
    "--install-location",
    "/",
    "--identifier",
    `${metadata.bundleIdentifier}.native-hosts`,
    "--version",
    metadata.version,
    hostComponent,
  ]);

  run("productbuild", [
    process.env.DEVELOPER_ID_INSTALLER ? "--sign" : "",
    process.env.DEVELOPER_ID_INSTALLER ?? "",
    "--package",
    appComponent,
    "--package",
    hostComponent,
    outputPackage,
  ]);

  return outputPackage;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const channel = argValue("channel", "direct");
  const outputRoot = resolve(
    argValue("output", resolve(appRoot, ".build/packages")),
  );
  const packagePath = packageRelease({ channel, outputRoot });
  console.log(`Built ${channel} package at ${packagePath}`);
}
