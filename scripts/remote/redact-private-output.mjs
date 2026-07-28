#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import { TextDecoder } from "node:util";

const [inputPath] = process.argv.slice(2);
const replacementSpecs = [
  ["YTME_REDACT_REMOTE_HOST", "[remote-host]"],
  ["YTME_REDACT_REMOTE_USER", "[remote-user]"],
  ["YTME_REDACT_REMOTE_WORK_ROOT", "[remote-work-root]"],
  ["YTME_REDACT_REMOTE_SSH_KEY", "[remote-ssh-key]"],
  ["YTME_REDACT_WINDOWS_REMOTE_HOST", "[windows-remote-host]"],
  ["YTME_REDACT_WINDOWS_REMOTE_USER", "[windows-remote-user]"],
  ["YTME_REDACT_WINDOWS_REMOTE_WORK_ROOT", "[windows-remote-work-root]"],
  ["YTME_REDACT_WINDOWS_REMOTE_SSH_KEY", "[windows-remote-ssh-key]"],
];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteral(input, search, replacement, caseInsensitive) {
  if (!caseInsensitive) {
    return input.split(search).join(replacement);
  }

  return input.replace(new RegExp(escapeRegExp(search), "giu"), replacement);
}

try {
  if (!inputPath) {
    throw new Error("missing input");
  }

  const replacements = replacementSpecs
    .flatMap(([environmentName, placeholder]) => {
      const value = process.env[environmentName] ?? "";
      const caseInsensitive = true;
      const isWindowsValue = environmentName.includes("WINDOWS_");
      const variants = new Set([value]);
      if (isWindowsValue) {
        variants.add(value.replaceAll("\\", "/"));
        variants.add(value.replaceAll("/", "\\"));
        for (const variant of [...variants]) {
          variants.add(variant.replaceAll("\\", "\\\\"));
        }
      }

      return [...variants].map((variant) => ({
        caseInsensitive,
        placeholder,
        value: variant,
      }));
    })
    .filter(({ value }) => value.length > 0)
    .sort((left, right) => right.value.length - left.value.length);

  let output = new TextDecoder("utf-8", { fatal: true }).decode(
    readFileSync(inputPath),
  );
  for (const { caseInsensitive, placeholder, value } of replacements) {
    output = replaceLiteral(output, value, placeholder, caseInsensitive);
  }

  process.stdout.write(output);
} catch {
  process.exitCode = 1;
}
