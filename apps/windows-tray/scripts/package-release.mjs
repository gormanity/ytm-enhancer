#!/usr/bin/env node
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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

function envFlag(name) {
  return ["1", "true", "yes"].includes(
    process.env[name]?.trim().toLowerCase() ?? "",
  );
}

function fileVersion(metadata) {
  return `${metadata.version}.${metadata.buildNumber}`;
}

function powershellCommand() {
  const configured = process.env.YTM_WINDOWS_TRAY_POWERSHELL?.trim();
  if (configured) return configured;

  return process.platform === "win32" ? "powershell.exe" : "pwsh";
}

function publishProject({ project, outputDirectory, runtime, metadata }) {
  run("dotnet", [
    "publish",
    project,
    "-c",
    "Release",
    "-r",
    runtime,
    "--self-contained",
    "true",
    "/p:PublishSingleFile=true",
    "/p:IncludeNativeLibrariesForSelfExtract=true",
    "/p:EnableCompressionInSingleFile=true",
    `/p:Version=${metadata.version}`,
    `/p:AssemblyVersion=${fileVersion(metadata)}`,
    `/p:FileVersion=${fileVersion(metadata)}`,
    `/p:InformationalVersion=${metadata.version}`,
    "-o",
    outputDirectory,
  ]);
}

function maybeSignPayload(payloadRoot) {
  const certificatePath =
    process.env.YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH?.trim();
  if (!certificatePath) {
    if (envFlag("YTM_WINDOWS_TRAY_CODESIGN_REQUIRED")) {
      throw new Error(
        "Windows tray signing is required, but YTM_WINDOWS_TRAY_CODESIGN_CERTIFICATE_PATH is not set.",
      );
    }

    return;
  }

  run(powershellCommand(), [
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    resolve(appRoot, "scripts/sign-release-payload.ps1"),
    "-PayloadRoot",
    payloadRoot,
    "-CertificatePath",
    certificatePath,
  ]);
}

function releasePaths({ runtime, metadata, outputRoot }) {
  if (!metadata.runtimes.includes(runtime)) {
    throw new Error(`Unsupported Windows tray runtime: ${runtime}`);
  }

  const workRoot = resolve(appRoot, ".build/package-work", runtime);
  const payloadRoot = join(workRoot, "payload");
  const archiveName = `${metadata.assetPrefix}-${metadata.version}-${runtime}.zip`;
  const archivePath = resolve(outputRoot, archiveName);

  return { archivePath, payloadRoot, workRoot };
}

function buildReleasePayload({
  runtime = "win-x64",
  outputRoot = resolve(appRoot, ".build/packages"),
} = {}) {
  const metadata = readReleaseMetadata();
  const { archivePath, payloadRoot, workRoot } = releasePaths({
    runtime,
    metadata,
    outputRoot,
  });

  rmSync(workRoot, { recursive: true, force: true });
  mkdirSync(payloadRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  publishProject({
    project: resolve(appRoot, "src/YTMTray/YTMTray.csproj"),
    outputDirectory: payloadRoot,
    runtime,
    metadata,
  });
  publishProject({
    project: resolve(
      appRoot,
      "src/YTMTray.NativeHost/YTMTray.NativeHost.csproj",
    ),
    outputDirectory: payloadRoot,
    runtime,
    metadata,
  });
  publishProject({
    project: resolve(appRoot, "src/YTMTray.Setup/YTMTray.Setup.csproj"),
    outputDirectory: payloadRoot,
    runtime,
    metadata,
  });

  // Retain this bridge so the 0.1.6 updater can hand off to the native setup
  // executable. New installs and subsequent updates launch YTMTray.Setup.exe.
  copyFileSync(
    resolve(appRoot, "scripts/install-native-hosts.ps1"),
    join(payloadRoot, "install-native-hosts.ps1"),
  );
  writeFileSync(
    join(payloadRoot, "release.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        appName: metadata.appName,
        buildNumber: metadata.buildNumber,
        connectorId: metadata.connectorId,
        githubReleaseTagPrefix: metadata.githubReleaseTagPrefix,
        installUrl: metadata.installUrl,
        minimumWindowsVersion: metadata.minimumWindowsVersion,
        nativeHostName: metadata.nativeHostName,
        releaseListUrl: metadata.githubReleaseListUrl,
        runtimeIdentifier: runtime,
        updateManifestAssetName: `${metadata.assetPrefix}-update.json`,
        version: metadata.version,
      },
      null,
      2,
    )}\n`,
  );

  return { archivePath, payloadRoot };
}

function archivePayloadDirectory({ archivePath, payloadRoot }) {
  const entries = readdirSync(payloadRoot).sort();
  if (entries.length === 0) {
    throw new Error(
      `Windows tray package payload contains no files: ${payloadRoot}`,
    );
  }

  run("tar", [
    "-a",
    "-c",
    "-f",
    archivePath,
    "-C",
    payloadRoot,
    "--",
    ...entries,
  ]);
}

function archiveReleasePayload({
  runtime = "win-x64",
  outputRoot = resolve(appRoot, ".build/packages"),
} = {}) {
  const metadata = readReleaseMetadata();
  const { archivePath, payloadRoot } = releasePaths({
    runtime,
    metadata,
    outputRoot,
  });

  if (!existsSync(payloadRoot)) {
    throw new Error(
      `Windows tray package payload was not found: ${payloadRoot}`,
    );
  }

  mkdirSync(outputRoot, { recursive: true });
  rmSync(archivePath, { force: true });
  archivePayloadDirectory({ archivePath, payloadRoot });

  return archivePath;
}

function packageRelease({
  runtime = "win-x64",
  outputRoot = resolve(appRoot, ".build/packages"),
} = {}) {
  const { archivePath, payloadRoot } = buildReleasePayload({
    runtime,
    outputRoot,
  });

  maybeSignPayload(payloadRoot);

  archiveReleasePayload({
    runtime,
    outputRoot,
  });

  return archivePath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runtime = argValue("runtime", "win-x64");
  const outputRoot = resolve(
    argValue("output", resolve(appRoot, ".build/packages")),
  );
  const stage = argValue("stage", "package");

  if (stage === "payload") {
    const { payloadRoot } = buildReleasePayload({ runtime, outputRoot });
    console.log(`Built Windows tray package payload at ${payloadRoot}`);
  } else if (stage === "archive-payload") {
    const payloadRoot = argValue("payload");
    const archivePath = argValue("archive");
    if (!payloadRoot || !archivePath) {
      throw new Error(
        "Windows tray archive-payload stage requires --payload and --archive.",
      );
    }

    archivePayloadDirectory({
      archivePath: resolve(archivePath),
      payloadRoot: resolve(payloadRoot),
    });
    console.log(`Built Windows tray package at ${resolve(archivePath)}`);
  } else if (stage === "archive") {
    const archivePath = archiveReleasePayload({ runtime, outputRoot });
    console.log(`Built Windows tray package at ${archivePath}`);
  } else if (stage === "package") {
    const archivePath = packageRelease({ runtime, outputRoot });
    console.log(`Built Windows tray package at ${archivePath}`);
  } else {
    throw new Error(`Unsupported Windows tray package stage: ${stage}`);
  }
}

export { archiveReleasePayload, buildReleasePayload, packageRelease };
