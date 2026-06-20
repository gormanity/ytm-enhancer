#!/usr/bin/env node
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

const APP_ICON_NAME = "YTMMenuBarIcon";
const APP_ICON_FILE_NAME = "YTMMenuBarIcon.icns";
const APP_ICON_SAFE_AREA_TRANSFORM = "translate(6 6) scale(0.90625)";
const APP_ICON_ACCENT_RING =
  /[ \t]*<circle cx="64" cy="64" r="41" fill="none" stroke="#FFFFFF" stroke-opacity="0\.12" stroke-width="1" \/>\n?/;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function renderTemplate(template, values) {
  return template.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
    if (!(key in values)) {
      throw new Error(`Missing template value ${key}`);
    }
    return values[key];
  });
}

function validateSparklePublicEdKey(value) {
  const key = value.trim();

  if (!key || key === "__SPARKLE_PUBLIC_ED_KEY__") {
    throw new Error("SPARKLE_PUBLIC_ED_KEY is required for direct packages.");
  }

  const decoded = Buffer.from(key, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== key) {
    throw new Error(
      "SPARKLE_PUBLIC_ED_KEY must be a base64-encoded 32-byte EdDSA public key.",
    );
  }

  return key;
}

function resolveSparkleConfiguration({
  sparkleEnabled,
  requireSparklePublicKey,
}) {
  if (!sparkleEnabled) {
    return { enabled: false, publicEdKey: "" };
  }

  const rawPublicKey = process.env.SPARKLE_PUBLIC_ED_KEY ?? "";
  if (!rawPublicKey.trim() && !requireSparklePublicKey) {
    return { enabled: false, publicEdKey: "" };
  }

  return {
    enabled: true,
    publicEdKey: validateSparklePublicEdKey(rawPublicKey),
  };
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

function copyResourceBundles(releaseDirectory, destinationDirectory) {
  for (const entry of readdirSync(releaseDirectory)) {
    if (!entry.endsWith(".bundle") || !entry.includes("YTMMenuBarConnector")) {
      continue;
    }
    cpSync(join(releaseDirectory, entry), join(destinationDirectory, entry), {
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

async function renderIconPng(sourceSvg, destinationPng, pixelSize) {
  try {
    await sharp(sourceSvg)
      .resize(pixelSize, pixelSize)
      .png()
      .toFile(destinationPng);
  } catch (error) {
    throw new Error(
      `Failed to render ${pixelSize}px app icon from ${sourceSvg}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function createAppIcon(resourcesDirectory) {
  const sourceSvg = resolve(
    appRoot,
    "Sources/YTMMenuBarConnector/Resources/extension-icon.svg",
  );
  const workDirectory = mkdtempSync(join(tmpdir(), "ytm-menu-bar-iconset-"));
  const iconsetDirectory = join(workDirectory, `${APP_ICON_NAME}.iconset`);
  const appIconSvg = join(workDirectory, "app-icon.svg");
  const iconPath = join(resourcesDirectory, APP_ICON_FILE_NAME);
  const iconsetEntries = [
    ["icon_16x16.png", 16],
    ["icon_16x16@2x.png", 32],
    ["icon_32x32.png", 32],
    ["icon_32x32@2x.png", 64],
    ["icon_128x128.png", 128],
    ["icon_128x128@2x.png", 256],
    ["icon_256x256.png", 256],
    ["icon_256x256@2x.png", 512],
    ["icon_512x512.png", 512],
    ["icon_512x512@2x.png", 1024],
  ];

  try {
    writeFileSync(appIconSvg, appIconSvgSource(sourceSvg));
    mkdirSync(iconsetDirectory, { recursive: true });
    for (const [fileName, pixelSize] of iconsetEntries) {
      await renderIconPng(
        appIconSvg,
        join(iconsetDirectory, fileName),
        pixelSize,
      );
    }
    run("iconutil", ["-c", "icns", "-o", iconPath, iconsetDirectory]);
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

function appIconSvgSource(sourceSvg) {
  const source = readFileSync(sourceSvg, "utf-8");
  const withoutAccentRing = source.replace(APP_ICON_ACCENT_RING, "");

  if (withoutAccentRing === source) {
    throw new Error("Failed to remove app icon accent ring from source SVG.");
  }

  const appIconSource = withoutAccentRing
    .replace(
      "</defs>\n\n",
      `</defs>\n\n  <g transform="${APP_ICON_SAFE_AREA_TRANSFORM}">\n`,
    )
    .replace(/\n<\/svg>\s*$/, "\n  </g>\n</svg>\n");

  if (appIconSource === withoutAccentRing) {
    throw new Error("Failed to inset app icon artwork.");
  }

  return appIconSource;
}

const frameworkRpath = "@executable_path/../Frameworks";

function readLoadCommands(executablePath) {
  return execFileSync("otool", ["-l", executablePath], {
    encoding: "utf-8",
  });
}

function addFrameworkRpath(executablePath) {
  if (readLoadCommands(executablePath).includes(frameworkRpath)) {
    return;
  }

  run("install_name_tool", ["-add_rpath", frameworkRpath, executablePath]);
}

function verifyFrameworkRpath(executablePath) {
  const loadCommands = readLoadCommands(executablePath);
  if (!loadCommands.includes(frameworkRpath)) {
    throw new Error(
      `Release executable is missing framework rpath: ${executablePath}`,
    );
  }
}

function signAppBundle(appDirectory) {
  const identity = process.env.DEVELOPER_ID_APPLICATION ?? "-";
  const developerIdArgs =
    identity === "-" ? [] : ["--options", "runtime", "--timestamp"];
  const sign = (path) => {
    run("codesign", ["--force", ...developerIdArgs, "--sign", identity, path]);
  };
  const verify = (path) => {
    run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", path]);
  };

  const sparkleFramework = join(
    appDirectory,
    "Contents/Frameworks/Sparkle.framework",
  );
  const sparkleVersion = join(sparkleFramework, "Versions/B");
  const sparkleNestedCode = [
    join(sparkleVersion, "Updater.app"),
    join(sparkleVersion, "XPCServices/Downloader.xpc"),
    join(sparkleVersion, "XPCServices/Installer.xpc"),
    join(sparkleVersion, "Autoupdate"),
  ];

  for (const nestedPath of sparkleNestedCode) {
    sign(nestedPath);
  }
  sign(sparkleFramework);
  verify(sparkleFramework);

  sign(appDirectory);
  verify(appDirectory);
}

export async function buildReleaseApp({
  channel = "direct",
  outputRoot = resolve(appRoot, ".build/release-apps"),
  requireSparklePublicKey = false,
} = {}) {
  const metadata = readReleaseMetadata();

  if (!["direct", "homebrew"].includes(channel)) {
    throw new Error(`Unsupported release channel: ${channel}`);
  }

  const sparkle = resolveSparkleConfiguration({
    requireSparklePublicKey,
    sparkleEnabled: metadata.channels[channel].sparkleEnabled,
  });

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
  const executablePath = join(macOSDirectory, "YTMMenuBarConnector");
  addFrameworkRpath(executablePath);
  verifyFrameworkRpath(executablePath);
  copySparkleFramework(releaseDirectory, contentsDirectory);
  copyResourceBundles(releaseDirectory, resourcesDirectory);
  await createAppIcon(resourcesDirectory);

  const plist = renderTemplate(
    readFileSync(resolve(appRoot, "release/Info.plist.template"), "utf-8"),
    {
      APP_NAME: metadata.appName,
      APPCAST_URL: metadata.appcastUrl,
      BASE_VERSION: metadata.baseVersion,
      BUILD_NUMBER: metadata.buildNumber,
      BUNDLE_IDENTIFIER: metadata.bundleIdentifier,
      DISPLAY_VERSION: metadata.displayVersion,
      MINIMUM_MACOS_VERSION: metadata.minimumMacOSVersion,
      SPARKLE_ALLOWS_AUTOMATIC_UPDATES: "false",
      SPARKLE_AUTOMATIC_CHECKS: "false",
      SPARKLE_PUBLIC_ED_KEY: sparkle.publicEdKey,
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
  const appDirectory = await buildReleaseApp({
    channel,
    outputRoot,
    requireSparklePublicKey: hasFlag("require-sparkle-public-key"),
  });
  console.log(`Built ${channel} app at ${appDirectory}`);
}
