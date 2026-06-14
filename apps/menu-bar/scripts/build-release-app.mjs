#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Missing template value ${key}`);
    }
    return values[key];
  });
}

function swiftBuild(channel) {
  const args = ["build", "--package-path", appRoot, "-c", "release"];
  if (channel === "homebrew") {
    args.push("-Xswiftc", "-DYTM_MENU_BAR_HOMEBREW");
  }
  execFileSync("swift", args, { stdio: "inherit" });
}

function run(command, args) {
  execFileSync(command, args.filter(Boolean), { stdio: "inherit" });
}

function copyResourceBundles(releaseDirectory, resourcesDirectory) {
  for (const entry of readdirSync(releaseDirectory)) {
    if (!entry.endsWith(".bundle") || !entry.includes("YTMMenuBarConnector")) {
      continue;
    }
    cpSync(join(releaseDirectory, entry), join(resourcesDirectory, entry), {
      recursive: true,
    });
  }
}

function copySparkleFramework(releaseDirectory, contentsDirectory) {
  const source = join(releaseDirectory, "Sparkle.framework");
  if (!existsSync(source)) {
    throw new Error(`Sparkle.framework was not found at ${source}`);
  }

  const frameworksDirectory = join(contentsDirectory, "Frameworks");
  mkdirSync(frameworksDirectory, { recursive: true });
  cpSync(source, join(frameworksDirectory, "Sparkle.framework"), {
    recursive: true,
    verbatimSymlinks: true,
  });
}

function signAppBundle(appDirectory) {
  const identity = process.env.DEVELOPER_ID_APPLICATION ?? "-";
  const developerIdArgs =
    identity === "-" ? [] : ["--options", "runtime", "--timestamp"];

  const sparkleFramework = join(
    appDirectory,
    "Contents/Frameworks/Sparkle.framework",
  );
  run("codesign", [
    "--force",
    ...developerIdArgs,
    "--sign",
    identity,
    sparkleFramework,
  ]);
  run("codesign", [
    "--force",
    ...developerIdArgs,
    "--sign",
    identity,
    appDirectory,
  ]);
}

export function buildReleaseApp({
  channel = "direct",
  outputRoot = resolve(appRoot, ".build/release-apps"),
} = {}) {
  const metadata = readReleaseMetadata();

  if (!["direct", "homebrew"].includes(channel)) {
    throw new Error(`Unsupported release channel: ${channel}`);
  }

  swiftBuild(channel);

  const releaseDirectory = resolve(appRoot, ".build/release");
  const appDirectory = resolve(outputRoot, channel, `${metadata.appName}.app`);
  const contentsDirectory = join(appDirectory, "Contents");
  const macOSDirectory = join(contentsDirectory, "MacOS");
  const resourcesDirectory = join(contentsDirectory, "Resources");
  rmSync(appDirectory, { recursive: true, force: true });
  mkdirSync(macOSDirectory, { recursive: true });
  mkdirSync(resourcesDirectory, { recursive: true });

  cpSync(
    join(releaseDirectory, "YTMMenuBarConnector"),
    join(macOSDirectory, "YTMMenuBarConnector"),
  );
  copySparkleFramework(releaseDirectory, contentsDirectory);
  copyResourceBundles(releaseDirectory, resourcesDirectory);

  const sparkleEnabled = metadata.channels[channel].sparkleEnabled;
  const plist = renderTemplate(
    readFileSync(resolve(appRoot, "release/Info.plist.template"), "utf-8"),
    {
      APP_NAME: metadata.appName,
      APPCAST_URL: metadata.appcastUrl,
      BUILD_NUMBER: metadata.buildNumber,
      BUNDLE_IDENTIFIER: metadata.bundleIdentifier,
      MINIMUM_MACOS_VERSION: metadata.minimumMacOSVersion,
      SPARKLE_ALLOWS_AUTOMATIC_UPDATES: sparkleEnabled ? "true" : "false",
      SPARKLE_AUTOMATIC_CHECKS: sparkleEnabled ? "true" : "false",
      SPARKLE_PUBLIC_ED_KEY:
        process.env.SPARKLE_PUBLIC_ED_KEY ?? "__SPARKLE_PUBLIC_ED_KEY__",
      VERSION: metadata.version,
    },
  );
  writeFileSync(join(contentsDirectory, "Info.plist"), plist);
  writeFileSync(join(contentsDirectory, "PkgInfo"), "APPL????");
  signAppBundle(appDirectory);

  return appDirectory;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const channel = argValue("channel", "direct");
  const outputRoot = resolve(
    argValue("output", resolve(appRoot, ".build/release-apps")),
  );
  const appDirectory = buildReleaseApp({ channel, outputRoot });
  console.log(`Built ${channel} app at ${appDirectory}`);
}
