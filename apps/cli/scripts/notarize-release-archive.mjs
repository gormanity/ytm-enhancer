#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? fallback
  );
}

function credentialArgs(credentials) {
  return [
    "--key",
    credentials.key,
    "--key-id",
    credentials.keyId,
    ...(credentials.issuer ? ["--issuer", credentials.issuer] : []),
  ];
}

function runOutput(command, args) {
  const output = execFileSync(command, args, {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  process.stdout.write(output);
  return output;
}

const archive = resolve(argValue("archive"));
const credentials = {
  issuer: process.env.APP_STORE_CONNECT_ISSUER_ID ?? "",
  key: process.env.APP_STORE_CONNECT_PRIVATE_KEY ?? "",
  keyId: process.env.APP_STORE_CONNECT_KEY_ID ?? "",
};

if (!existsSync(archive) || !archive.endsWith(".zip")) {
  throw new Error("A macOS CLI .zip archive is required.");
}
if (!credentials.key || !credentials.keyId) {
  throw new Error("App Store Connect notarization credentials are required.");
}

const output = runOutput("xcrun", [
  "notarytool",
  "submit",
  archive,
  ...credentialArgs(credentials),
  "--wait",
  "--output-format",
  "json",
]);
const result = JSON.parse(output);
if (result.status !== "Accepted") {
  if (result.id) {
    execFileSync(
      "xcrun",
      ["notarytool", "log", result.id, ...credentialArgs(credentials)],
      { stdio: "inherit" },
    );
  }
  throw new Error(
    `CLI archive notarization failed with status ${result.status ?? "unknown"}.`,
  );
}

console.log(`Notarized ${archive}`);
