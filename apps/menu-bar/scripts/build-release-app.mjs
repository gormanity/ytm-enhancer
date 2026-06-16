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

export function buildReleaseApp({
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

  const plist = renderTemplate(
    readFileSync(resolve(appRoot, "release/Info.plist.template"), "utf-8"),
    {
      APP_NAME: metadata.appName,
      APPCAST_URL: metadata.appcastUrl,
      BUILD_NUMBER: metadata.buildNumber,
      BUNDLE_IDENTIFIER: metadata.bundleIdentifier,
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
  const appDirectory = buildReleaseApp({
    channel,
    outputRoot,
    requireSparklePublicKey: hasFlag("require-sparkle-public-key"),
  });
  console.log(`Built ${channel} app at ${appDirectory}`);
}
