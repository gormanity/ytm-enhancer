#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(scriptRoot, "..");
const repoRoot = resolve(cliRoot, "../..");
const buildRoot = resolve(cliRoot, ".build");
const metadata = JSON.parse(
  readFileSync(resolve(cliRoot, "release/metadata.json"), "utf-8"),
);
const runtimeMap = {
  "linux-arm64": {
    archiveExtension: ".tar.gz",
    goarch: "arm64",
    goos: "linux",
  },
  "linux-x64": {
    archiveExtension: ".tar.gz",
    goarch: "amd64",
    goos: "linux",
  },
  "macos-arm64": {
    archiveExtension: ".zip",
    goarch: "arm64",
    goos: "darwin",
  },
  "macos-x64": {
    archiveExtension: ".zip",
    goarch: "amd64",
    goos: "darwin",
  },
};

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((argument) => argument.startsWith(prefix))
      ?.slice(prefix.length) ?? fallback
  );
}

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function sourceVersion() {
  const source = readFileSync(
    resolve(cliRoot, "internal/protocol/protocol.go"),
    "utf-8",
  );
  const match = /ConnectorVersion\s+=\s+"([^"]+)"/.exec(source);
  if (!match) {
    throw new Error("Could not resolve the CLI connector version.");
  }
  return match[1];
}

function releaseVersion() {
  const source = sourceVersion();
  const requested = process.env.YTM_CLI_VERSION ?? source;
  if (requested !== source) {
    throw new Error(
      `CLI tag version ${requested} does not match source version ${source}.`,
    );
  }
  return requested;
}

function checksum(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function writeChecksums(packageRoot, version) {
  const prefix = `${metadata.assetPrefix}-${version}-`;
  const archives = readdirSync(packageRoot)
    .filter(
      (name) =>
        name.startsWith(prefix) &&
        (name.endsWith(".zip") || name.endsWith(".tar.gz")),
    )
    .sort();
  const lines = archives.map(
    (name) => `${checksum(resolve(packageRoot, name))}  ${name}`,
  );
  writeFileSync(resolve(packageRoot, "SHA256SUMS"), `${lines.join("\n")}\n`);
}

function packageName(version, runtime) {
  return `${metadata.assetPrefix}-${version}-${runtime}`;
}

function payloadPath(version, runtime) {
  return resolve(
    buildRoot,
    "package-work",
    runtime,
    packageName(version, runtime),
  );
}

function preparePayload({ runtime, version }) {
  const config = runtimeMap[runtime];
  const outputRoot = payloadPath(version, runtime);
  rmSync(dirname(outputRoot), { force: true, recursive: true });
  mkdirSync(outputRoot, { recursive: true });

  const environment = {
    ...process.env,
    CGO_ENABLED: "0",
    GOARCH: config.goarch,
    GOOS: config.goos,
  };
  for (const command of ["ytme", "ytme-native-host"]) {
    run(
      "go",
      [
        "-C",
        cliRoot,
        "build",
        "-trimpath",
        "-ldflags=-s -w",
        "-o",
        resolve(outputRoot, command),
        `./cmd/${command}`,
      ],
      { env: environment },
    );
    chmodSync(resolve(outputRoot, command), 0o755);
  }

  for (const name of ["install.sh", "uninstall.sh"]) {
    const destination = resolve(outputRoot, name);
    copyFileSync(resolve(cliRoot, "release", name), destination);
    chmodSync(destination, 0o755);
  }
  copyFileSync(resolve(cliRoot, "README.md"), resolve(outputRoot, "README.md"));
  copyFileSync(resolve(repoRoot, "LICENSE"), resolve(outputRoot, "LICENSE"));
  writeFileSync(resolve(outputRoot, "VERSION"), `${version}\n`);
  writeFileSync(resolve(outputRoot, "RUNTIME"), `${runtime}\n`);
  return outputRoot;
}

function archivePayload({ runtime, version }) {
  const config = runtimeMap[runtime];
  const source = payloadPath(version, runtime);
  if (!statSync(source).isDirectory()) {
    throw new Error(`CLI payload is missing: ${source}`);
  }

  const packageRoot = resolve(buildRoot, "packages");
  const archive = resolve(
    packageRoot,
    `${packageName(version, runtime)}${config.archiveExtension}`,
  );
  mkdirSync(packageRoot, { recursive: true });
  rmSync(archive, { force: true });

  if (config.archiveExtension === ".zip") {
    run("zip", ["-qry", archive, basename(source)], {
      cwd: dirname(source),
    });
  } else {
    run("tar", ["-czf", archive, "-C", dirname(source), basename(source)]);
  }
  writeChecksums(packageRoot, version);
  return archive;
}

const runtime = argValue("runtime");
const stage = argValue("stage", "all");
const validStages = ["--stage=payload", "--stage=archive", "--stage=all"];

if (!(runtime in runtimeMap) || !metadata.runtimes.includes(runtime)) {
  throw new Error(`--runtime must be one of: ${metadata.runtimes.join(", ")}`);
}
if (!["all", "archive", "payload"].includes(stage)) {
  throw new Error(`Invalid stage. Use ${validStages.join(", ")}.`);
}

const version = releaseVersion();
if (stage === "all" || stage === "payload") {
  preparePayload({ runtime, version });
}
if (stage === "all" || stage === "archive") {
  const archive = archivePayload({ runtime, version });
  console.log(`Wrote ${archive}`);
}
