#!/usr/bin/env node

import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { chromium } from "playwright";
import { renderStoreCopy } from "./store-copy.mjs";

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
  ["05-connected-apps", { width: 1280, height: 800 }],
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
  const trackedPath = resolve(sourceDir, `${assetName}.png`);
  await page.setViewportSize(size);
  await page.goto(`file://${inputPath}`);
  const screenshot = await page.screenshot({
    animations: "disabled",
    fullPage: false,
    type: "png",
  });
  await Promise.all([
    writeFile(outputPath, screenshot),
    writeFile(trackedPath, screenshot),
  ]);
  console.log(`Rendered ${assetName}.png (${size.width}x${size.height})`);
}

async function buildStoreAssets() {
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });
  const copy = renderStoreCopy();
  await Promise.all([
    copyFile(canonicalCopy, resolve(outputDir, "STORE.md")),
    writeFile(resolve(outputDir, "short-description.txt"), copy.short),
    writeFile(resolve(outputDir, "description.txt"), copy.detailed),
    writeFile(resolve(outputDir, "firefox-description.md"), copy.firefox),
  ]);
  console.log("Generated canonical and paste-ready store copy");

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      let state = 0x1a2b3c4d;
      Math.random = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 0x100000000;
      };
    });
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
