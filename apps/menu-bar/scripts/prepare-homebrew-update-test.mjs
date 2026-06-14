#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { generateHomebrewCask } from "./generate-homebrew-cask.mjs";
import { packageRelease } from "./package-release.mjs";
import { appRoot } from "./release-metadata.mjs";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf-8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
}

function withReleaseMetadata({ buildNumber, version }, fn) {
  const previous = {
    buildNumber: process.env.YTM_MENU_BAR_BUILD_NUMBER,
    version: process.env.YTM_MENU_BAR_VERSION,
  };

  process.env.YTM_MENU_BAR_BUILD_NUMBER = buildNumber;
  process.env.YTM_MENU_BAR_VERSION = version;

  try {
    return fn();
  } finally {
    restoreEnv("YTM_MENU_BAR_BUILD_NUMBER", previous.buildNumber);
    restoreEnv("YTM_MENU_BAR_VERSION", previous.version);
  }
}

function restoreEnv(name, value) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function git(tapRoot, args) {
  run("git", ["-C", tapRoot, ...args]);
}

function writeSummary(path, summary) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`);
}

function isWithin(root, path) {
  const resolvedRoot = resolve(root);
  return path === resolvedRoot || path.startsWith(`${resolvedRoot}/`);
}

function assertSafeOutputRoot(path) {
  const allowedRoots = [
    resolve(appRoot, ".build/update-test"),
    resolve(tmpdir()),
    "/private/tmp",
    "/tmp",
  ];

  if (!allowedRoots.some((root) => isWithin(root, path))) {
    throw new Error(
      "--output must be inside apps/menu-bar/.build/update-test or a system temporary directory.",
    );
  }
}

const oldVersion = argValue("old-version", "0.1.0");
const oldBuild = argValue("old-build", "1");
const newVersion = argValue("new-version", "0.1.1");
const newBuild = argValue("new-build", "2");
const tapName = argValue("tap-name", "ytm-enhancer/local-update-test");
const outputRoot = resolve(
  argValue("output", resolve(appRoot, ".build/update-test/homebrew")),
);
const tapRoot = join(outputRoot, "tap");
const caskPath = join(tapRoot, "Casks/ytm-menu-bar.rb");
const nextCaskPath = join(outputRoot, "next/ytm-menu-bar.rb");
const promoteScriptPath = join(outputRoot, "promote-new-cask.sh");

assertSafeOutputRoot(outputRoot);
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(dirname(caskPath), { recursive: true });
mkdirSync(dirname(nextCaskPath), { recursive: true });

const oldPackage = withReleaseMetadata(
  { buildNumber: oldBuild, version: oldVersion },
  () =>
    packageRelease({
      channel: "homebrew",
      outputRoot: join(outputRoot, "packages/old"),
    }),
);
const oldUrl = pathToFileURL(oldPackage).href;
withReleaseMetadata({ buildNumber: oldBuild, version: oldVersion }, () =>
  generateHomebrewCask({
    packagePath: oldPackage,
    packageUrl: oldUrl,
    outputPath: caskPath,
  }),
);

run("git", ["init", tapRoot]);
git(tapRoot, ["config", "user.name", "YTM Enhancer Release Test"]);
git(tapRoot, [
  "config",
  "user.email",
  "ytm-enhancer-release-test@example.invalid",
]);
git(tapRoot, ["add", "Casks/ytm-menu-bar.rb"]);
git(tapRoot, ["commit", "-m", `Add ytm-menu-bar ${oldVersion}`]);

const newPackage = withReleaseMetadata(
  { buildNumber: newBuild, version: newVersion },
  () =>
    packageRelease({
      channel: "homebrew",
      outputRoot: join(outputRoot, "packages/new"),
    }),
);
const newUrl = pathToFileURL(newPackage).href;
withReleaseMetadata({ buildNumber: newBuild, version: newVersion }, () =>
  generateHomebrewCask({
    packagePath: newPackage,
    packageUrl: newUrl,
    outputPath: nextCaskPath,
  }),
);

writeFileSync(
  promoteScriptPath,
  `#!/bin/sh
set -eu
cp "${nextCaskPath}" "${caskPath}"
git -C "${tapRoot}" add Casks/ytm-menu-bar.rb
git -C "${tapRoot}" commit -m "Update ytm-menu-bar to ${newVersion}"
`,
  { mode: 0o755 },
);

const summary = {
  installOldCommand: `brew tap ${tapName} ${tapRoot} && brew install --cask ${tapName}/ytm-menu-bar`,
  newPackage,
  oldPackage,
  promoteNewCaskCommand: promoteScriptPath,
  tapName,
  tapRoot,
  uninstallCommand: `brew uninstall --cask ytm-menu-bar && brew untap ${tapName}`,
  upgradeCommand: `sh ${promoteScriptPath} && brew update && brew upgrade --cask ytm-menu-bar`,
  verifyVersionCommand:
    "plutil -extract CFBundleShortVersionString raw '/Applications/YTM Menu Bar.app/Contents/Info.plist'",
};

writeSummary(join(outputRoot, "summary.json"), summary);
console.log(`Prepared Homebrew update test tap at ${tapRoot}`);
console.log(`Install old cask: ${summary.installOldCommand}`);
console.log(`Promote and upgrade: ${summary.upgradeCommand}`);
