#!/usr/bin/env node
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  return (
    process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length) ??
    fallback
  );
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function defaultReleaseNotesUrl(metadata) {
  const url = new URL(metadata.appcastUrl);
  url.pathname = url.pathname.replace(
    /\/?appcast\.xml$/,
    `/release-notes/${metadata.version}.html`,
  );
  return url.toString();
}

function writeDefaultReleaseNotes({ metadata, outputPath }) {
  const notesPath = resolve(
    dirname(outputPath),
    "release-notes",
    `${metadata.version}.html`,
  );
  const notesHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(metadata.appName)} ${escapeHtml(metadata.version)} Release Notes</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        margin: 0;
        padding: 24px;
        color: CanvasText;
        background: Canvas;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }

      p,
      li {
        font-size: 15px;
        line-height: 1.5;
      }

      ul {
        margin: 12px 0 0;
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(metadata.appName)} ${escapeHtml(metadata.version)}</h1>
    <p>This release keeps the menu bar companion app up to date with YTM Enhancer.</p>
    <ul>
      <li>Includes the latest menu bar app improvements and maintenance fixes.</li>
      <li>Recommended for all direct-install users.</li>
    </ul>
  </body>
</html>
`;

  mkdirSync(dirname(notesPath), { recursive: true });
  writeFileSync(notesPath, notesHtml);
  return notesPath;
}

export function generateAppcast({
  archivePath,
  archiveUrl,
  edSignature,
  outputPath = resolve(appRoot, ".build/appcast/menu-bar/appcast.xml"),
  releaseBaseUrl = "https://github.com/gormanity/ytm-enhancer/releases/download",
  releaseNotesUrl,
} = {}) {
  const metadata = readReleaseMetadata();

  if (!archivePath) {
    throw new Error("archivePath is required");
  }
  if (!edSignature) {
    throw new Error("Sparkle EdDSA signature is required");
  }

  const tag = `${metadata.githubReleaseTagPrefix}${metadata.version}`;
  const archiveName = archivePath.split("/").at(-1);
  const url = archiveUrl ?? `${releaseBaseUrl}/${tag}/${archiveName}`;
  const notesUrl = releaseNotesUrl ?? defaultReleaseNotesUrl(metadata);
  const length = statSync(archivePath).size;
  const checksum = sha256(archivePath);
  const appcast = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"
  xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>${escapeXml(metadata.appName)} Updates</title>
    <link>${escapeXml(metadata.appcastUrl)}</link>
    <description>menu-bar/appcast.xml</description>
    <item>
      <title>${escapeXml(metadata.appName)} ${escapeXml(metadata.version)}</title>
      <sparkle:version>${escapeXml(metadata.buildNumber)}</sparkle:version>
      <sparkle:shortVersionString>${escapeXml(metadata.version)}</sparkle:shortVersionString>
      <sparkle:minimumSystemVersion>${escapeXml(metadata.minimumMacOSVersion)}</sparkle:minimumSystemVersion>
      <sparkle:releaseNotesLink>${escapeXml(notesUrl)}</sparkle:releaseNotesLink>
      <enclosure
        url="${escapeXml(url)}"
        sparkle:edSignature="${escapeXml(edSignature)}"
        sparkle:sha256="${checksum}"
        length="${length}"
        type="application/zip" />
    </item>
  </channel>
</rss>
`;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, appcast);
  if (!releaseNotesUrl) {
    writeDefaultReleaseNotes({ metadata, outputPath });
  }
  return outputPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const archive = argValue("archive", "");
  const archiveUrl = argValue("archive-url", "");
  const releaseNotesUrl = argValue("release-notes-url", "");
  const outputPath = generateAppcast({
    archivePath: archive ? resolve(archive) : "",
    archiveUrl: archiveUrl || undefined,
    edSignature: argValue(
      "ed-signature",
      process.env.SPARKLE_ED_SIGNATURE ?? "",
    ),
    outputPath: resolve(
      argValue(
        "output",
        resolve(appRoot, ".build/appcast/menu-bar/appcast.xml"),
      ),
    ),
    releaseBaseUrl: argValue(
      "release-base-url",
      "https://github.com/gormanity/ytm-enhancer/releases/download",
    ),
    releaseNotesUrl: releaseNotesUrl || undefined,
  });
  console.log(`Wrote appcast to ${outputPath}`);
}
