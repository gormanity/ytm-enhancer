#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const canonicalCopy = resolve(import.meta.dirname, "..", "store", "STORE.md");

function extractSection(markdown, heading, nextMarker) {
  const marker = `### ${heading}`;
  const start = markdown.indexOf(marker);
  if (start === -1) {
    throw new Error(`Missing store copy section: ${heading}`);
  }

  const bodyStart = start + marker.length;
  const end = markdown.indexOf(nextMarker, bodyStart);
  if (end === -1) {
    throw new Error(`Missing store copy boundary after: ${heading}`);
  }

  return markdown.slice(bodyStart, end).trim();
}

function stripInlineMarkdown(value) {
  return value
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[`*_]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function renderPlainText(markdown) {
  const blocks = [];
  let paragraph = [];
  let list = [];

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push(stripInlineMarkdown(paragraph.join(" ")));
      paragraph = [];
    }
  };

  const flushList = () => {
    if (list.length > 0) {
      blocks.push(
        list.map((item) => `• ${stripInlineMarkdown(item)}`).join("\n"),
      );
      list = [];
    }
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^#{1,6}\s/.test(line)) {
      flushParagraph();
      flushList();
      blocks.push(stripInlineMarkdown(line.replace(/^#{1,6}\s+/, "")));
      continue;
    }

    if (line.startsWith("- ")) {
      flushParagraph();
      list.push(line.slice(2));
      continue;
    }

    if (list.length > 0) {
      list[list.length - 1] += ` ${line}`;
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  flushList();
  return `${blocks.join("\n\n")}\n`;
}

export function renderStoreCopy(
  markdown = readFileSync(canonicalCopy, "utf-8"),
) {
  const shortSource = extractSection(
    markdown,
    "Short Description",
    "\n### Detailed Description",
  );
  const detailedSource = extractSection(
    markdown,
    "Detailed Description",
    "\n---",
  );

  return {
    short: `${stripInlineMarkdown(shortSource)}\n`,
    detailed: renderPlainText(detailedSource),
  };
}

function main() {
  const section = process.argv[2];
  const copy = renderStoreCopy();

  if (section !== "short" && section !== "detailed") {
    throw new Error("Usage: node scripts/store-copy.mjs <short|detailed>");
  }

  process.stdout.write(copy[section]);
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  main();
}
