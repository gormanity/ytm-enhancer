#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const DEFAULT_RADIUS = 18;
const DEFAULT_EDGE_INSET = 1;

function usage() {
  console.error(
    "Usage: node apps/windows-tray/scripts/mask-release-screenshot.mjs <png-path> [radius]",
  );
}

function parseRadius(value) {
  if (value === undefined) return DEFAULT_RADIUS;
  const radius = Number(value);
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new Error(`Invalid corner radius: ${value}`);
  }
  return radius;
}

async function maskScreenshot(inputPath, radius) {
  const image = sharp(inputPath).ensureAlpha();
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;

  if (!width || !height) {
    throw new Error(`Unable to read PNG dimensions: ${inputPath}`);
  }

  const maskX = DEFAULT_EDGE_INSET;
  const maskY = DEFAULT_EDGE_INSET;
  const maskWidth = width - DEFAULT_EDGE_INSET * 2;
  const maskHeight = height - DEFAULT_EDGE_INSET * 2;

  if (maskWidth <= 0 || maskHeight <= 0) {
    throw new Error(`PNG is too small to mask: ${inputPath}`);
  }

  const mask = Buffer.from(`
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${maskX}" y="${maskY}" width="${maskWidth}" height="${maskHeight}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>
  `);
  const masked = await image
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  await writeFile(inputPath, masked);
}

const [, , rawPath, rawRadius] = process.argv;

if (!rawPath) {
  usage();
  process.exit(2);
}

maskScreenshot(resolve(rawPath), parseRadius(rawRadius)).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
