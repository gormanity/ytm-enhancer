#!/usr/bin/env node
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { appRoot, readReleaseMetadata } from "./release-metadata.mjs";

const repoRoot = resolve(appRoot, "../..");

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

function defaultInstallPageUrl(metadata) {
  const url = new URL(metadata.appcastUrl);
  url.pathname = url.pathname.replace(/\/?appcast\.xml$/, "/install.html");
  return url.toString();
}

function releasePageUrl(tag) {
  return `https://github.com/gormanity/ytm-enhancer/releases/tag/${tag}`;
}

function packageUrl({ metadata, releaseBaseUrl, packageName }) {
  const tag = `${metadata.githubReleaseTagPrefix}${metadata.version}`;
  return `${releaseBaseUrl}/${tag}/${packageName}`;
}

function homebrewInstallCommand() {
  return "brew install --cask gormanity/tap/ytm-menu-bar";
}

function homebrewUpdateCommand() {
  return "brew update && brew upgrade --cask ytm-menu-bar";
}

function readExtensionVersion() {
  const packageJson = JSON.parse(
    readFileSync(resolve(repoRoot, "package.json"), "utf-8"),
  );

  return packageJson.version;
}

function writeReleaseIndex({ metadata, outputPath, releaseBaseUrl }) {
  const extensionVersion = readExtensionVersion();
  const extensionTag = `v${extensionVersion}`;
  const menuBarTag = `${metadata.githubReleaseTagPrefix}${metadata.version}`;
  const directPackageName = `YTM-Menu-Bar-${metadata.version}.pkg`;
  const homebrewPackageName = `YTM-Menu-Bar-Homebrew-${metadata.version}.pkg`;
  const indexPath = resolve(dirname(outputPath), "..", "releases.json");
  const index = {
    schemaVersion: 1,
    products: {
      extension: {
        id: "browser-extension",
        name: "YTM Enhancer",
        latestVersion: extensionVersion,
        tag: extensionTag,
        releaseUrl: releasePageUrl(extensionTag),
        updateSources: ["browser-stores", "github-release-assets"],
      },
      menuBar: {
        id: "menu-bar",
        name: metadata.appName,
        latestVersion: metadata.version,
        buildNumber: metadata.buildNumber,
        tag: menuBarTag,
        releaseUrl: releasePageUrl(menuBarTag),
        installPage: defaultInstallPageUrl(metadata),
        appcast: metadata.appcastUrl,
        minimumMacOSVersion: metadata.minimumMacOSVersion,
        channels: {
          direct: {
            asset: directPackageName,
            packageUrl: packageUrl({
              metadata,
              releaseBaseUrl,
              packageName: directPackageName,
            }),
            updateFeed: metadata.appcastUrl,
          },
          homebrew: {
            asset: homebrewPackageName,
            packageUrl: packageUrl({
              metadata,
              releaseBaseUrl,
              packageName: homebrewPackageName,
            }),
            installCommand: homebrewInstallCommand(),
            updateCommand: homebrewUpdateCommand(),
          },
        },
      },
    },
  };

  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return indexPath;
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

function writeInstallPage({ metadata, outputPath, releaseBaseUrl }) {
  const installPath = resolve(dirname(outputPath), "install.html");
  const iconSvg = readFileSync(
    resolve(
      appRoot,
      "Sources/YTMMenuBarConnector/Resources/extension-icon.svg",
    ),
    "utf-8",
  );
  const screenshotFileName = "menu-bar-screenshot.png";
  const screenshotPath = resolve(appRoot, "release", screenshotFileName);
  const directPackageName = `YTM-Menu-Bar-${metadata.version}.pkg`;
  const directUrl = packageUrl({
    metadata,
    releaseBaseUrl,
    packageName: directPackageName,
  });
  const releaseNotesUrl = defaultReleaseNotesUrl(metadata);
  const command = homebrewInstallCommand();
  const installHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(metadata.appName)} for YTM Enhancer</title>
    <style>
      :root {
        color-scheme: dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: #090909;
        color: #f4f4f5;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(135deg, #121217 0%, #080808 58%, #130b18 100%);
      }

      a {
        color: inherit;
      }

      main {
        width: 100%;
        max-width: 1000px;
        margin: 0 auto;
        padding: 64px 20px;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 0.94fr) minmax(320px, 440px);
        gap: 48px;
        align-items: center;
        min-height: min(640px, calc(100vh - 128px));
      }

      .app-mark {
        display: grid;
        place-items: center;
        width: 58px;
        height: 58px;
        margin-bottom: 20px;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 16px;
        background: rgb(255 255 255 / 0.08);
      }

      .app-mark svg {
        width: 42px;
        height: 42px;
      }

      .eyebrow {
        margin: 0 0 14px;
        color: #b9b9c4;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: 72px;
        line-height: 0.95;
      }

      .summary {
        max-width: 680px;
        margin: 24px 0 0;
        color: #d0d0d8;
        font-size: 20px;
        line-height: 1.45;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 14px;
        margin-top: 34px;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 48px;
        padding: 0 20px;
        border: 1px solid rgb(255 255 255 / 0.16);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.1);
        font-size: 16px;
        font-weight: 800;
        text-decoration: none;
      }

      .button-primary {
        border-color: #ff1f1f;
        background: #ff1f1f;
        color: #fff;
      }

      .screenshot-frame {
        margin: 0;
        justify-self: end;
        width: min(440px, 100%);
      }

      .screenshot-frame img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 22px;
        box-shadow: 0 26px 90px rgb(0 0 0 / 0.34);
      }

      .panel-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 18px;
        margin-top: 28px;
      }

      .panel {
        min-height: 100%;
        padding: 22px;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.06);
      }

      h2 {
        margin: 0 0 10px;
        font-size: 18px;
      }

      p {
        margin: 0;
        color: #c8c8d0;
        font-size: 15px;
        line-height: 1.55;
      }

      code {
        display: block;
        margin-top: 14px;
        padding: 14px;
        overflow-x: auto;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 8px;
        background: rgb(0 0 0 / 0.34);
        color: #fff;
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 14px;
      }

      @media (max-width: 760px) {
        main {
          margin: 0;
          max-width: 390px;
          padding: 36px 24px;
        }

        .hero {
          grid-template-columns: 1fr;
          min-height: auto;
        }

        .screenshot-frame {
          justify-self: start;
          width: 100%;
        }

        h1 {
          font-size: 44px;
        }

        .actions {
          flex-direction: column;
          align-items: stretch;
        }

        .panel-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero" aria-labelledby="title">
        <div>
          <div class="app-mark" aria-hidden="true">
            ${iconSvg}
          </div>
          <p class="eyebrow">YTM Enhancer companion app</p>
          <h1 id="title">${escapeHtml(metadata.appName)}</h1>
          <p class="summary">
            Native macOS menu bar playback info and controls for YouTube Music,
            powered by YTM Enhancer's Connected Apps API.
          </p>
          <div class="actions" aria-label="Install options">
            <a class="button button-primary" href="${escapeHtml(directUrl)}">
              Download for macOS
            </a>
            <a class="button" href="${escapeHtml(releaseNotesUrl)}">Release notes</a>
          </div>
        </div>
        <figure class="screenshot-frame">
          <img
            src="./${escapeHtml(screenshotFileName)}"
            alt="YTM Menu Bar showing playback details, controls, and the next track"
          >
        </figure>
      </section>

      <section class="panel-grid" aria-label="Installation details">
        <article class="panel">
          <h2>Latest Version</h2>
          <p>
            Version ${escapeHtml(metadata.version)} for macOS
            ${escapeHtml(metadata.minimumMacOSVersion)} or later.
          </p>
        </article>
        <article class="panel">
          <h2>Setup</h2>
          <p>
            After installing, open YTM Enhancer, enable Connected Apps, then
            open YTM Menu Bar from macOS.
          </p>
        </article>
        <article class="panel">
          <h2>Homebrew</h2>
          <p>Install the app with Homebrew if you prefer package manager updates.</p>
          <code>${escapeHtml(command)}</code>
        </article>
        <article class="panel">
          <h2>Updates</h2>
          <p>
            Direct installs update from the app. Homebrew installs update with
          </p>
          <code>brew update &amp;&amp; brew upgrade --cask ytm-menu-bar</code>
        </article>
        <article class="panel">
          <h2>Uninstall</h2>
          <p>
            Direct installs include an uninstaller in Applications. Homebrew
            installs uninstall through Homebrew.
          </p>
          <code>/Applications/YTM Menu Bar Uninstaller.command</code>
          <code>brew uninstall --cask ytm-menu-bar</code>
        </article>
        <article class="panel">
          <h2>Privacy</h2>
          <p>
            YTM Menu Bar communicates with YTM Enhancer through the connector
            API. It does not read YouTube Music pages directly.
          </p>
        </article>
        <article class="panel">
          <h2>macOS Security</h2>
          <p>
            Releases are signed with Developer ID and notarized by Apple for
            distribution outside the Mac App Store.
          </p>
        </article>
      </section>
    </main>
  </body>
</html>
`;

  mkdirSync(dirname(installPath), { recursive: true });
  copyFileSync(
    screenshotPath,
    resolve(dirname(installPath), screenshotFileName),
  );
  writeFileSync(installPath, installHtml);
  return installPath;
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
  writeInstallPage({ metadata, outputPath, releaseBaseUrl });
  writeReleaseIndex({ metadata, outputPath, releaseBaseUrl });
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
