#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

const metadata = readReleaseMetadata();

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function generateHomebrewCask({
  packagePath,
  outputPath = resolve(appRoot, ".build/homebrew/Casks/ytm-menu-bar.rb"),
} = {}) {
  if (!packagePath) {
    throw new Error("packagePath is required");
  }

  const template = readFileSync(
    resolve(appRoot, "release/homebrew/ytm-menu-bar.rb.template"),
    "utf-8",
  );
  const cask = template
    .replaceAll("{{VERSION}}", metadata.version)
    .replaceAll("{{SHA256}}", sha256(packagePath));

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, cask);
  return outputPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const packagePath = argValue("package", "");
  const outputPath = generateHomebrewCask({
    packagePath: packagePath ? resolve(packagePath) : "",
    outputPath: resolve(
      argValue(
        "output",
        resolve(appRoot, ".build/homebrew/Casks/ytm-menu-bar.rb"),
      ),
    ),
  });
  console.log(`Wrote Homebrew cask to ${outputPath}`);
}
