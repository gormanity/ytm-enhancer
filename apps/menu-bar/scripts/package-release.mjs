#!/usr/bin/env node
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { buildReleaseApp } from "./build-release-app.mjs";
import { writeNativeHostManifests } from "./generate-native-host-manifests.mjs";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

const metadata = readReleaseMetadata();

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

export function packageRelease({
  channel = "direct",
  outputRoot = resolve(appRoot, ".build/packages"),
} = {}) {
  if (!["direct", "homebrew"].includes(channel)) {
    throw new Error(`Unsupported release channel: ${channel}`);
  }

  const appDirectory = buildReleaseApp({ channel });
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
    },
  );
  writeNativeHostManifests(hostPayloadRoot);

  const appComponent = join(componentRoot, "app.pkg");
  const hostComponent = join(componentRoot, "native-hosts.pkg");

  run("pkgbuild", [
    "--root",
    appPayloadRoot,
    "--identifier",
    `${metadata.bundleIdentifier}.app`,
    "--version",
    metadata.version,
    appComponent,
  ]);
  run("pkgbuild", [
    "--root",
    hostPayloadRoot,
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
