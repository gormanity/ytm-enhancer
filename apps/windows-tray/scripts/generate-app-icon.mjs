#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDirectory, "..");
const repoRoot = resolve(appRoot, "../..");
const sourcePath = resolve(repoRoot, "src/assets/icon.svg");
const outputPath = resolve(appRoot, "assets/YTMEnhancer.ico");
const iconSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];

async function renderIcon(size) {
  const png = await sharp(sourcePath)
    .resize(size, size)
    .png({
      adaptiveFiltering: true,
      compressionLevel: 9,
    })
    .toBuffer();

  return { png, size };
}

function createIco(images) {
  const directorySize = 6 + images.length * 16;
  const iconSize =
    directorySize +
    images.reduce((total, image) => total + image.png.length, 0);
  const icon = Buffer.alloc(iconSize);

  icon.writeUInt16LE(0, 0);
  icon.writeUInt16LE(1, 2);
  icon.writeUInt16LE(images.length, 4);

  let dataOffset = directorySize;
  images.forEach(({ png, size }, index) => {
    const entryOffset = 6 + index * 16;
    icon[entryOffset] = size === 256 ? 0 : size;
    icon[entryOffset + 1] = size === 256 ? 0 : size;
    icon[entryOffset + 2] = 0;
    icon[entryOffset + 3] = 0;
    icon.writeUInt16LE(1, entryOffset + 4);
    icon.writeUInt16LE(32, entryOffset + 6);
    icon.writeUInt32LE(png.length, entryOffset + 8);
    icon.writeUInt32LE(dataOffset, entryOffset + 12);
    png.copy(icon, dataOffset);
    dataOffset += png.length;
  });

  return icon;
}

async function generateIcon() {
  const images = [];
  for (const size of iconSizes) {
    images.push(await renderIcon(size));
  }
  return createIco(images);
}

const generatedIcon = await generateIcon();
if (process.argv.includes("--check")) {
  if (
    !existsSync(outputPath) ||
    !readFileSync(outputPath).equals(generatedIcon)
  ) {
    throw new Error(
      `Windows app icon is stale. Run: node ${fileURLToPath(import.meta.url)}`,
    );
  }
  console.log(`Windows app icon is current: ${outputPath}`);
} else {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, generatedIcon);
  console.log(`Generated Windows app icon: ${outputPath}`);
}
