#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { maybeSignPayload } from "./package-release.mjs";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function fileVersion(metadata) {
  return `${metadata.version}.${metadata.buildNumber}`;
}

function packagePath(packageRoot, metadata, runtime) {
  return resolve(
    packageRoot,
    `${metadata.assetPrefix}-${metadata.version}-${runtime}.zip`,
  );
}

function validatePackage(path, runtime) {
  if (!existsSync(path)) {
    throw new Error(
      `The ${runtime} Windows tray package was not found: ${path}`,
    );
  }
  if (statSync(path).size === 0) {
    throw new Error(`The ${runtime} Windows tray package is empty: ${path}`);
  }
}

function buildCombinedInstaller({
  packageRoot = resolve(appRoot, ".build/packages"),
  outputRoot = resolve(appRoot, ".build/installer"),
  workRoot = resolve(appRoot, ".build/installer-work"),
} = {}) {
  const metadata = readReleaseMetadata();
  const x64Package = packagePath(packageRoot, metadata, "win-x64");
  const arm64Package = packagePath(packageRoot, metadata, "win-arm64");
  validatePackage(x64Package, "win-x64");
  validatePackage(arm64Package, "win-arm64");

  rmSync(workRoot, { recursive: true, force: true });
  rmSync(outputRoot, { recursive: true, force: true });
  const publishRoot = join(workRoot, "publish");
  mkdirSync(publishRoot, { recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  run("dotnet", [
    "publish",
    resolve(appRoot, "src/YTMTray.Installer/YTMTray.Installer.csproj"),
    "-c",
    "Release",
    "-r",
    "win-x64",
    "--self-contained",
    "true",
    "/p:PublishSingleFile=true",
    "/p:IncludeNativeLibrariesForSelfExtract=true",
    "/p:EnableCompressionInSingleFile=true",
    `/p:Version=${metadata.version}`,
    `/p:AssemblyVersion=${fileVersion(metadata)}`,
    `/p:FileVersion=${fileVersion(metadata)}`,
    `/p:InformationalVersion=${metadata.version}`,
    `/p:YTMTrayInstallerX64Package=${x64Package}`,
    `/p:YTMTrayInstallerArm64Package=${arm64Package}`,
    "-o",
    publishRoot,
  ]);

  const publishedExecutable = join(publishRoot, "YTMTray.Installer.exe");
  if (!existsSync(publishedExecutable)) {
    throw new Error(
      `The combined Windows tray installer was not published: ${publishedExecutable}`,
    );
  }

  const installerPath = join(
    outputRoot,
    `${metadata.assetPrefix}-${metadata.version}-Setup.exe`,
  );
  copyFileSync(publishedExecutable, installerPath);
  maybeSignPayload(outputRoot);
  return installerPath;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const installerPath = buildCombinedInstaller({
    packageRoot: resolve(
      argValue("package-root", resolve(appRoot, ".build/packages")),
    ),
    outputRoot: resolve(
      argValue("output", resolve(appRoot, ".build/installer")),
    ),
    workRoot: resolve(
      argValue("work", resolve(appRoot, ".build/installer-work")),
    ),
  });
  console.log(`Built combined Windows tray installer at ${installerPath}`);
}

export { buildCombinedInstaller };
