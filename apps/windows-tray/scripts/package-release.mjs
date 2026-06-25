#!/usr/bin/env node
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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

function fileVersion(metadata) {
  return `${metadata.version}.${metadata.buildNumber}`;
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
    return;
  }

  run("pwsh", [
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

function packageRelease({
  runtime = "win-x64",
  outputRoot = resolve(appRoot, ".build/packages"),
} = {}) {
  const metadata = readReleaseMetadata();
  if (!metadata.runtimes.includes(runtime)) {
    throw new Error(`Unsupported Windows tray runtime: ${runtime}`);
  }

  const workRoot = resolve(appRoot, ".build/package-work", runtime);
  const payloadRoot = join(workRoot, "payload");
  const archiveName = `${metadata.assetPrefix}-${metadata.version}-${runtime}.zip`;
  const archivePath = resolve(outputRoot, archiveName);

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

  copyFileSync(
    resolve(appRoot, "scripts/install-native-hosts.ps1"),
    join(payloadRoot, "install-native-hosts.ps1"),
  );
  copyFileSync(
    resolve(appRoot, "scripts/uninstall-native-hosts.ps1"),
    join(payloadRoot, "uninstall-native-hosts.ps1"),
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

  maybeSignPayload(payloadRoot);

  rmSync(archivePath, { force: true });
  run("tar", ["-a", "-c", "-f", archivePath, "-C", payloadRoot, "."]);

  return archivePath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivePath = packageRelease({
    runtime: argValue("runtime", "win-x64"),
    outputRoot: resolve(
      argValue("output", resolve(appRoot, ".build/packages")),
    ),
  });
  console.log(`Built Windows tray package at ${archivePath}`);
}

export { packageRelease };
