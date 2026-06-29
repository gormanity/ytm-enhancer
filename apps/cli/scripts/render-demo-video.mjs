#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const appRoot = resolve(import.meta.dirname, "..");
const inputPath = resolve(appRoot, "release/cli-demo.html");
const outputVideoPath = resolve(appRoot, "release/cli-demo.webm");
const outputPosterPath = resolve(appRoot, "release/cli-demo-poster.png");

async function recordDemo(page) {
  const dataUrl = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("CLI demo canvas was not found.");
    }

    const stream = canvas.captureStream(30);
    const supportedMimeTypes = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const mimeType =
      supportedMimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) ??
      "";
    const recorder = new MediaRecorder(stream, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: 1800000,
    });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    });

    const stopped = new Promise((resolve) => {
      recorder.addEventListener("stop", resolve, { once: true });
    });

    const duration = window.CLI_DEMO_DURATION_MS;
    recorder.start();
    await new Promise((resolve) => {
      const started = performance.now();
      function step(now) {
        const elapsed = Math.min(duration, now - started);
        window.renderCliDemoFrame(elapsed);
        if (elapsed >= duration) {
          resolve();
          return;
        }
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
    recorder.stop();
    await stopped;

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(reader.result));
      reader.addEventListener("error", () => reject(reader.error));
      reader.readAsDataURL(blob);
    });
  });

  return Buffer.from(dataUrl.split(",")[1], "base64");
}

async function renderDemoVideo() {
  await mkdir(dirname(outputVideoPath), { recursive: true });

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: 960, height: 540 },
    });
    await page.goto(`${pathToFileURL(inputPath).href}?render=1`);
    await page.evaluate(() => window.renderCliDemoFrame(7600));
    await page.screenshot({
      path: outputPosterPath,
      clip: { x: 0, y: 0, width: 960, height: 540 },
    });

    const video = await recordDemo(page);
    await writeFile(outputVideoPath, video);
  } finally {
    await browser.close();
  }

  console.log(`Rendered ${outputVideoPath}`);
  console.log(`Rendered ${outputPosterPath}`);
}

renderDemoVideo().catch((error) => {
  console.error("CLI demo video render failed:", error);
  process.exit(1);
});
