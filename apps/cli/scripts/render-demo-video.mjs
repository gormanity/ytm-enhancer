#!/usr/bin/env node

import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "../../..");
const appRoot = resolve(repoRoot, "apps/cli");
const inputPath = resolve(appRoot, "release/cli-demo.tape");
const outputVideoPath = resolve(appRoot, "release/cli-demo.webm");
const outputPosterPath = resolve(appRoot, "release/cli-demo-poster.png");

async function run(command, args) {
  try {
    const { stderr, stdout } = await execFileAsync(command, args, {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024 * 8,
    });
    return { stderr, stdout };
  } catch (error) {
    const commandError = error;
    const output = [commandError.stdout, commandError.stderr]
      .filter(Boolean)
      .join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${output}`, {
      cause: error,
    });
  }
}

async function requireCommand(command) {
  try {
    await run(command, ["--help"]);
  } catch {
    throw new Error(
      `CLI demo rendering requires '${command}' on PATH. Install VHS with Homebrew and ensure ffmpeg is available.`,
    );
  }
}

async function renderPoster() {
  await run("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-ss",
    "6",
    "-i",
    outputVideoPath,
    "-frames:v",
    "1",
    outputPosterPath,
  ]);
}

async function renderDemoVideo() {
  await mkdir(dirname(outputVideoPath), { recursive: true });

  await requireCommand("vhs");
  await requireCommand("ffmpeg");
  await run("vhs", ["validate", inputPath]);
  await run("vhs", [inputPath]);
  await renderPoster();

  console.log(`Rendered ${outputVideoPath}`);
  console.log(`Rendered ${outputPosterPath}`);
}

renderDemoVideo().catch((error) => {
  console.error("CLI demo video render failed:", error);
  process.exit(1);
});
