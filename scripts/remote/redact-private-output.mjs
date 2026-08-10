#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import { TextDecoder } from "node:util";

const [inputPath] = process.argv.slice(2);
const minimumReplacementLength = 4;
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

class ShortReplacementError extends Error {}

class DecodeError extends Error {
  constructor(byteOffset) {
    super("Command output was not valid supported text.");
    this.byteOffset = byteOffset;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteral(input, search, replacement, caseInsensitive) {
  if (!caseInsensitive) {
    return input.split(search).join(replacement);
  }

  return input.replace(new RegExp(escapeRegExp(search), "giu"), replacement);
}

function createHostSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function createHostVariants(value) {
  const variants = new Set([value, createHostSlug(value)]);
  const normalizedHost = value.trim().replace(/^\[|\]$/g, "");
  if (normalizedHost.includes(".") && !normalizedHost.includes(":")) {
    variants.add(normalizedHost.split(".", 1)[0]);
  }
  return variants;
}

function assertReplacementLength(value) {
  if (
    value.length > 0 &&
    (value.trim().length === 0 || value.length < minimumReplacementLength)
  ) {
    throw new ShortReplacementError();
  }
}

function findInvalidUtf8Offset(input, startOffset = 0) {
  for (let index = startOffset; index < input.length; index += 1) {
    const first = input[index];
    if (first <= 0x7f) {
      continue;
    }

    let continuationCount;
    let secondMinimum = 0x80;
    let secondMaximum = 0xbf;
    if (first >= 0xc2 && first <= 0xdf) {
      continuationCount = 1;
    } else if (first >= 0xe0 && first <= 0xef) {
      continuationCount = 2;
      if (first === 0xe0) {
        secondMinimum = 0xa0;
      } else if (first === 0xed) {
        secondMaximum = 0x9f;
      }
    } else if (first >= 0xf0 && first <= 0xf4) {
      continuationCount = 3;
      if (first === 0xf0) {
        secondMinimum = 0x90;
      } else if (first === 0xf4) {
        secondMaximum = 0x8f;
      }
    } else {
      return index;
    }

    if (index + continuationCount >= input.length) {
      return index;
    }
    const second = input[index + 1];
    if (second < secondMinimum || second > secondMaximum) {
      return index + 1;
    }
    for (let offset = 2; offset <= continuationCount; offset += 1) {
      const continuation = input[index + offset];
      if (continuation < 0x80 || continuation > 0xbf) {
        return index + offset;
      }
    }
    index += continuationCount;
  }
  return null;
}

function readUtf16CodeUnit(input, offset, littleEndian) {
  return littleEndian
    ? input[offset] | (input[offset + 1] << 8)
    : (input[offset] << 8) | input[offset + 1];
}

function findInvalidUtf16Offset(input, startOffset, littleEndian) {
  if ((input.length - startOffset) % 2 !== 0) {
    return input.length - 1;
  }
  for (let offset = startOffset; offset < input.length; offset += 2) {
    const codeUnit = readUtf16CodeUnit(input, offset, littleEndian);
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return offset;
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (offset + 3 >= input.length) {
        return offset;
      }
      const lowSurrogate = readUtf16CodeUnit(input, offset + 2, littleEndian);
      if (lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff) {
        return offset + 2;
      }
      offset += 2;
    }
  }
  return null;
}

function inferBomlessUtf16(input) {
  if (input.length < 4 || input.length % 2 !== 0) {
    return null;
  }
  let evenNulls = 0;
  let oddNulls = 0;
  const pairCount = input.length / 2;
  for (let offset = 0; offset < input.length; offset += 2) {
    if (input[offset] === 0) {
      evenNulls += 1;
    }
    if (input[offset + 1] === 0) {
      oddNulls += 1;
    }
  }
  const likelyNullCount = Math.max(2, Math.ceil(pairCount * 0.3));
  const unlikelyNullCount = Math.floor(pairCount * 0.1);
  if (oddNulls >= likelyNullCount && evenNulls <= unlikelyNullCount) {
    return "utf-16le";
  }
  if (evenNulls >= likelyNullCount && oddNulls <= unlikelyNullCount) {
    return "utf-16be";
  }
  return null;
}

function decodeText(input) {
  let encoding = "utf-8";
  let startOffset = 0;
  if (input[0] === 0xff && input[1] === 0xfe) {
    encoding = "utf-16le";
    startOffset = 2;
  } else if (input[0] === 0xfe && input[1] === 0xff) {
    encoding = "utf-16be";
    startOffset = 2;
  } else if (input[0] === 0xef && input[1] === 0xbb && input[2] === 0xbf) {
    startOffset = 3;
  } else {
    encoding = inferBomlessUtf16(input) ?? encoding;
  }

  const invalidOffset = encoding.startsWith("utf-16")
    ? findInvalidUtf16Offset(input, startOffset, encoding === "utf-16le")
    : findInvalidUtf8Offset(input, startOffset);
  if (invalidOffset !== null) {
    throw new DecodeError(invalidOffset);
  }

  const output = new TextDecoder(encoding, { fatal: true }).decode(
    input.subarray(startOffset),
  );
  if (output.includes("\0")) {
    const nullOffset = input.indexOf(0, startOffset);
    throw new DecodeError(nullOffset >= 0 ? nullOffset : startOffset);
  }
  return output;
}

function createReplacements() {
  return replacementSpecs
    .flatMap(([environmentName, placeholder]) => {
      const value = process.env[environmentName] ?? "";
      assertReplacementLength(value);
      const caseInsensitive = true;
      const isWindowsValue = environmentName.includes("WINDOWS_");
      const variants = environmentName.endsWith("_HOST")
        ? createHostVariants(value)
        : new Set([value]);
      if (isWindowsValue) {
        variants.add(value.replaceAll("\\", "/"));
        variants.add(value.replaceAll("/", "\\"));
        for (const variant of [...variants]) {
          variants.add(variant.replaceAll("\\", "\\\\"));
        }
      }

      return [...variants]
        .filter((variant) => variant.length >= minimumReplacementLength)
        .map((variant) => ({
          caseInsensitive,
          placeholder,
          value: variant,
        }));
    })
    .sort((left, right) => right.value.length - left.value.length);
}

let input;
try {
  if (!inputPath) {
    throw new Error("missing input");
  }

  input = readFileSync(inputPath);
  const replacements = createReplacements();
  let output = decodeText(input);
  for (const { caseInsensitive, placeholder, value } of replacements) {
    output = replaceLiteral(output, value, placeholder, caseInsensitive);
  }

  process.stdout.write(output);
} catch (error) {
  if (error instanceof ShortReplacementError) {
    process.stderr.write(
      "Remote QA redaction failed: a configured value is too short.\n",
    );
  } else if (error instanceof DecodeError && input) {
    const unit = input.length === 1 ? "byte" : "bytes";
    process.stderr.write(
      `Remote QA redaction failed for ${input.length} ${unit} at byte offset ${error.byteOffset}.\n`,
    );
  } else if (input) {
    const unit = input.length === 1 ? "byte" : "bytes";
    process.stderr.write(
      `Remote QA redaction failed for ${input.length} ${unit} at an unknown byte offset.\n`,
    );
  } else {
    process.stderr.write(
      "Remote QA redaction failed before input could be inspected.\n",
    );
  }
  process.exitCode = 1;
}
