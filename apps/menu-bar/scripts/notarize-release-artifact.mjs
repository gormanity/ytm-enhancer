#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { appRoot } from "./release-metadata.mjs";

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

function runOutput(command, args) {
  const output = execFileSync(command, args.filter(Boolean), {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  process.stdout.write(output);
  return output;
}

function credentialArgs(credentials) {
  return [
    "--key",
    credentials.key,
    "--key-id",
    credentials.keyId,
    credentials.issuer ? "--issuer" : "",
    credentials.issuer,
  ];
}

function resolveCredentials() {
  const key = argValue("key", process.env.APP_STORE_CONNECT_PRIVATE_KEY ?? "");
  const keyId = argValue("key-id", process.env.APP_STORE_CONNECT_KEY_ID ?? "");
  const issuer = argValue(
    "issuer",
    process.env.APP_STORE_CONNECT_ISSUER_ID ?? "",
  );

  if (!key) {
    throw new Error("APP_STORE_CONNECT_PRIVATE_KEY is required.");
  }
  if (!keyId) {
    throw new Error("APP_STORE_CONNECT_KEY_ID is required.");
  }

  return { issuer, key, keyId };
}

function notarizationSubmitPath({ artifactPath, outputRoot }) {
  if (artifactPath.endsWith(".app")) {
    const archivePath = resolve(
      outputRoot,
      `${basename(artifactPath, ".app")}-notarization.zip`,
    );
    rmSync(archivePath, { force: true });
    mkdirSync(outputRoot, { recursive: true });
    run("ditto", [
      "-c",
      "-k",
      "--sequesterRsrc",
      "--keepParent",
      artifactPath,
      archivePath,
    ]);
    return archivePath;
  }

  const extension = extname(artifactPath);
  if (extension === ".pkg" || extension === ".dmg") {
    return artifactPath;
  }

  throw new Error(`Unsupported notarization artifact: ${artifactPath}`);
}

export function notarizeReleaseArtifact({
  artifactPath,
  outputRoot = resolve(appRoot, ".build/notarization"),
} = {}) {
  if (!artifactPath) {
    throw new Error("artifactPath is required.");
  }
  if (!existsSync(artifactPath)) {
    throw new Error(`Artifact does not exist: ${artifactPath}`);
  }

  const credentials = resolveCredentials();
  const submitPath = notarizationSubmitPath({ artifactPath, outputRoot });
  const submitOutput = runOutput("xcrun", [
    "notarytool",
    "submit",
    submitPath,
    ...credentialArgs(credentials),
    "--wait",
    "--output-format",
    "json",
  ]);

  const submitResult = JSON.parse(submitOutput);
  if (submitResult.status !== "Accepted") {
    if (submitResult.id) {
      run("xcrun", [
        "notarytool",
        "log",
        submitResult.id,
        ...credentialArgs(credentials),
      ]);
    }
    throw new Error(
      `Notarization failed with status ${submitResult.status ?? "unknown"}.`,
    );
  }

  run("xcrun", ["stapler", "staple", artifactPath]);
  run("xcrun", ["stapler", "validate", artifactPath]);

  return artifactPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const artifact = argValue("path", "");
  const outputRoot = resolve(
    argValue("output", resolve(appRoot, ".build/notarization")),
  );
  const artifactPath = notarizeReleaseArtifact({
    artifactPath: artifact ? resolve(artifact) : "",
    outputRoot,
  });
  console.log(`Notarized and stapled ${artifactPath}`);
}
