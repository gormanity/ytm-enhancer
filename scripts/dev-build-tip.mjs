#!/usr/bin/env node
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  return spawnSync(cmd, args, { stdio: "inherit" });
}

function jjGet(args) {
  const r = spawnSync("jj", args, { encoding: "utf8" });
  return r.status === 0 ? r.stdout : null;
}

function buildWorkingCopy() {
  return run("pnpm", ["run", "dev:build:wc"]).status ?? 1;
}

const headsOutput = jjGet([
  "log",
  "-r",
  "heads(@:: & trunk()..)",
  "-T",
  'change_id ++ "\n"',
  "--no-graph",
]);

if (headsOutput === null) {
  process.exit(buildWorkingCopy());
}

const heads = headsOutput.split("\n").filter(Boolean);

if (heads.length === 0) {
  process.exit(buildWorkingCopy());
}

if (heads.length > 1) {
  console.error(
    `Multiple current stack heads detected:\n  ${heads.join("\n  ")}\n` +
      `Cannot determine tip. Use 'pnpm run dev:build:wc' to build the working copy.`,
  );
  process.exit(1);
}

const tip = heads[0];
const currentRaw = jjGet([
  "log",
  "-r",
  "@",
  "-T",
  'change_id ++ "\n"',
  "--no-graph",
]);
const current = currentRaw?.trim();

if (!current || tip === current) {
  process.exit(buildWorkingCopy());
}

const shortTip = tip.slice(0, 8);
const shortCurrent = current.slice(0, 8);
console.log(`Switching @ from ${shortCurrent} to tip ${shortTip} for build.`);

let status = 1;
try {
  if (run("jj", ["edit", tip]).status !== 0) process.exit(1);
  status = buildWorkingCopy();
} finally {
  console.log(`Restoring @ to ${shortCurrent}.`);
  run("jj", ["edit", current]);
}

process.exit(status);
