#!/usr/bin/env node

import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const appRoot = resolve(import.meta.dirname, "..");
const inputPath = resolve(appRoot, "release/windows-tray-screenshot.html");
const outputPath = resolve(appRoot, "release/windows-tray-screenshot.png");

async function renderScreenshot() {
  await mkdir(dirname(outputPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 442, height: 574 },
    });
    await page.goto(pathToFileURL(inputPath).href);
    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await browser.close();
  }

  console.log(`Rendered ${outputPath}`);
}

renderScreenshot().catch((error) => {
  console.error("Windows tray screenshot render failed:", error);
  process.exit(1);
});
