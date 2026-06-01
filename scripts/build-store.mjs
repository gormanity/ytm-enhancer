#!/usr/bin/env node

import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(import.meta.dirname, "..");
const storeDir = resolve(root, "store");
const sourceDir = resolve(storeDir, "screenshots");
const outputDir = resolve(root, "dist", "store-assets");
const canonicalCopy = resolve(storeDir, "STORE.md");

const ASSET_SIZES = new Map([
  ["01-playback-controls", { width: 1280, height: 800 }],
  ["02-mini-player", { width: 1280, height: 800 }],
  ["03-visualizer", { width: 1280, height: 800 }],
  ["04-sleep-timer", { width: 1280, height: 800 }],
  ["05-hotkeys-notifications", { width: 1280, height: 800 }],
  ["promo-marquee-1400x560", { width: 1400, height: 560 }],
  ["promo-small-440x280", { width: 440, height: 280 }],
]);

async function listHtmlSources() {
  const entries = await readdir(sourceDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && extname(entry.name) === ".html")
    .map((entry) => entry.name)
    .sort();
}

async function renderAsset(page, fileName) {
  const assetName = basename(fileName, ".html");
  const size = ASSET_SIZES.get(assetName);
  if (!size) {
    throw new Error(`No store asset size configured for ${fileName}`);
  }

  const inputPath = resolve(sourceDir, fileName);
  const outputPath = resolve(outputDir, `${assetName}.png`);
  await page.setViewportSize(size);
  await page.goto(`file://${inputPath}`);
  await page.screenshot({ path: outputPath, fullPage: false });
  console.log(`Rendered ${assetName}.png (${size.width}x${size.height})`);
}

async function buildStoreAssets() {
  await mkdir(outputDir, { recursive: true });
  await copyFile(canonicalCopy, resolve(outputDir, "STORE.md"));
  console.log("Copied STORE.md");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const source of await listHtmlSources()) {
      await renderAsset(page, source);
    }
  } finally {
    await browser.close();
  }

  console.log("\nStore asset build complete.");
}

buildStoreAssets().catch((error) => {
  console.error("Store asset build failed:", error);
  process.exit(1);
});
