#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { buildReleaseApp } from "./build-release-app.mjs";
import { generateAppcast } from "./generate-appcast.mjs";
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

function withReleaseMetadata(
  { appcastUrl, buildNumber, publicEdKey, version },
  fn,
) {
  const previous = {
    appcastUrl: process.env.YTM_MENU_BAR_APPCAST_URL,
    buildNumber: process.env.YTM_MENU_BAR_BUILD_NUMBER,
    publicEdKey: process.env.SPARKLE_PUBLIC_ED_KEY,
    version: process.env.YTM_MENU_BAR_VERSION,
  };

  process.env.YTM_MENU_BAR_APPCAST_URL = appcastUrl;
  process.env.YTM_MENU_BAR_BUILD_NUMBER = buildNumber;
  process.env.SPARKLE_PUBLIC_ED_KEY = publicEdKey;
  process.env.YTM_MENU_BAR_VERSION = version;

  try {
    return fn();
  } finally {
    restoreEnv("YTM_MENU_BAR_APPCAST_URL", previous.appcastUrl);
    restoreEnv("YTM_MENU_BAR_BUILD_NUMBER", previous.buildNumber);
    restoreEnv("SPARKLE_PUBLIC_ED_KEY", previous.publicEdKey);
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

function findFile(root, fileName, predicate = () => true) {
  if (!existsSync(root)) return null;

  const entries = readdirRecursive(root);
  return (
    entries.find(
      (entry) => entry.endsWith(`/${fileName}`) && predicate(entry),
    ) ?? null
  );
}

function findSparkleTool(fileName) {
  const preferredPath = resolve(
    appRoot,
    `.build/artifacts/sparkle/Sparkle/bin/${fileName}`,
  );
  if (existsSync(preferredPath)) return preferredPath;

  return findFile(
    resolve(appRoot, ".build"),
    fileName,
    (entry) => !entry.includes("/old_dsa_scripts/"),
  );
}

function readdirRecursive(root) {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    return statSync(path).isDirectory() ? readdirRecursive(path) : [path];
  });
}

function signArchive({ archivePath, privateKeyFile }) {
  const signUpdate = findSparkleTool("sign_update");

  if (!signUpdate || !existsSync(signUpdate)) {
    throw new Error(
      "Sparkle sign_update was not found. Build the menu bar app first.",
    );
  }

  if (!existsSync(privateKeyFile)) {
    throw new Error(
      `Sparkle private key file was not found: ${privateKeyFile}`,
    );
  }

  const output = run(
    signUpdate,
    ["--ed-key-file", privateKeyFile, archivePath],
    { capture: true },
  );
  const signature = output.match(/sparkle:edSignature="([^"]+)"/)?.[1];

  if (!signature) {
    throw new Error("Could not parse Sparkle EdDSA signature from sign_update");
  }

  return signature;
}

function parsePublicEdKey(output) {
  const trimmed = output.trim();
  const keyMatch = trimmed.match(/[A-Za-z0-9+/=]{40,}/);
  return keyMatch?.[0] ?? trimmed;
}

function resolvePublicEdKey({ keyAccount, publicEdKey }) {
  if (publicEdKey) return publicEdKey;
  if (process.env.SPARKLE_PUBLIC_ED_KEY) {
    return process.env.SPARKLE_PUBLIC_ED_KEY;
  }

  const generateKeys = findSparkleTool("generate_keys");
  if (!generateKeys || !existsSync(generateKeys)) {
    throw new Error(
      "SPARKLE_PUBLIC_ED_KEY is required when generate_keys is unavailable.",
    );
  }

  return parsePublicEdKey(
    run(generateKeys, ["--account", keyAccount, "-p"], { capture: true }),
  );
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function readPlistValue(appPath, key) {
  return run(
    "plutil",
    ["-extract", key, "raw", join(appPath, "Contents/Info.plist")],
    { capture: true },
  ).trim();
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
const port = argValue("port", "8787");
const keyAccount = argValue("key-account", "gormanity.ytm-enhancer.menu-bar");
const outputRoot = resolve(
  argValue("output", resolve(appRoot, ".build/update-test/sparkle")),
);
const privateKeyFile = resolve(
  argValue("ed-key-file", "sparkle_ed_private_key"),
);
const publicEdKey = resolvePublicEdKey({
  keyAccount,
  publicEdKey: argValue("public-ed-key", ""),
});
const feedRoot = join(outputRoot, "feed");
const feedUrl = `http://127.0.0.1:${port}/menu-bar/appcast.xml`;
const archiveName = `YTM-Menu-Bar-${newVersion}.pkg`;
const archivePath = join(feedRoot, archiveName);
const releaseNotesPath = join(feedRoot, "release-notes.html");
const releaseNotesUrl = `http://127.0.0.1:${port}/release-notes.html`;
const appcastPath = join(feedRoot, "menu-bar/appcast.xml");

assertSafeOutputRoot(outputRoot);
rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(feedRoot, { recursive: true });

const newApp = withReleaseMetadata(
  {
    appcastUrl: feedUrl,
    buildNumber: newBuild,
    publicEdKey,
    version: newVersion,
  },
  () =>
    buildReleaseApp({
      channel: "direct",
      outputRoot: join(outputRoot, "new-app"),
    }),
);
withReleaseMetadata(
  {
    appcastUrl: feedUrl,
    buildNumber: newBuild,
    publicEdKey,
    version: newVersion,
  },
  () =>
    packageRelease({
      channel: "direct",
      outputRoot: feedRoot,
      prebuiltAppDirectory: newApp,
    }),
);
const edSignature = signArchive({ archivePath, privateKeyFile });

writeFileSync(
  releaseNotesPath,
  `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>YTM Menu Bar ${newVersion}</title></head>
<body><h1>YTM Menu Bar ${newVersion}</h1><p>Local update test build.</p></body>
</html>
`,
);

withReleaseMetadata(
  {
    appcastUrl: feedUrl,
    buildNumber: newBuild,
    publicEdKey,
    version: newVersion,
  },
  () =>
    generateAppcast({
      archivePath,
      archiveUrl: `http://127.0.0.1:${port}/${archiveName}`,
      edSignature,
      outputPath: appcastPath,
      releaseNotesUrl,
    }),
);

const oldPackage = withReleaseMetadata(
  {
    appcastUrl: feedUrl,
    buildNumber: oldBuild,
    publicEdKey,
    version: oldVersion,
  },
  () =>
    packageRelease({
      channel: "direct",
      outputRoot: join(outputRoot, "old-package"),
    }),
);

const appcast = readFileSync(appcastPath, "utf-8");
for (const expected of [
  feedUrl,
  archiveName,
  edSignature,
  'type="application/octet-stream"',
  `<sparkle:version>${newBuild}</sparkle:version>`,
  `<sparkle:shortVersionString>${newVersion}</sparkle:shortVersionString>`,
  `<sparkle:minimumSystemVersion>13.0</sparkle:minimumSystemVersion>`,
]) {
  if (!appcast.includes(expected)) {
    throw new Error(`Generated appcast is missing ${expected}`);
  }
}

const summary = {
  archivePath,
  archiveSha256: sha256(archivePath),
  appcastPath,
  feedRoot,
  newApp,
  newBuild: readPlistValue(newApp, "CFBundleVersion"),
  newVersion: readPlistValue(newApp, "CFBundleShortVersionString"),
  oldPackage,
  serveCommand: `python3 -m http.server ${port} --directory ${feedRoot}`,
  installOldCommand: `sudo installer -pkg ${oldPackage} -target /`,
  verifyUpdatedVersionCommand:
    "plutil -extract CFBundleShortVersionString raw '/Applications/YTM Menu Bar.app/Contents/Info.plist'",
};

writeSummary(join(outputRoot, "summary.json"), summary);
console.log(`Prepared Sparkle update test at ${outputRoot}`);
console.log(`Serve feed: ${summary.serveCommand}`);
console.log(`Install old package: ${summary.installOldCommand}`);
