#!/usr/bin/env node
import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, resolve } from "node:path";
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
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeMarkdownLinkHref(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function renderInlineMarkdown(value) {
  const source = String(value);
  let output = "";
  let index = 0;

  while (index < source.length) {
    const remainder = source.slice(index);
    const code = /^`([^`\n]+)`/.exec(remainder);
    if (code) {
      output += `<code>${escapeHtml(code[1])}</code>`;
      index += code[0].length;
      continue;
    }

    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(remainder);
    if (link) {
      const href = safeMarkdownLinkHref(link[2]);
      if (href) {
        output += `<a href="${escapeHtml(href)}">${escapeHtml(link[1])}</a>`;
        index += link[0].length;
        continue;
      }
    }

    output += escapeHtml(source[index]);
    index += 1;
  }

  return output;
}

export function renderReleaseNotesMarkdown(markdown) {
  const output = [];
  const paragraph = [];
  const listItem = [];
  let listOpen = false;

  const closeParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph.length = 0;
  };
  const closeListItem = () => {
    if (listItem.length === 0) {
      return;
    }
    output.push(`<li>${renderInlineMarkdown(listItem.join(" "))}</li>`);
    listItem.length = 0;
  };
  const closeList = () => {
    if (!listOpen) {
      return;
    }
    closeListItem();
    output.push("</ul>");
    listOpen = false;
  };

  for (const rawLine of markdown.replaceAll("\r\n", "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      closeParagraph();
      closeList();
      continue;
    }
    if (listOpen && /^\s{2,}\S/.test(rawLine) && !line.startsWith("- ")) {
      listItem.push(line);
      continue;
    }
    const heading = /^(#{2,3})\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      closeParagraph();
      if (!listOpen) {
        output.push("<ul>");
        listOpen = true;
      }
      closeListItem();
      listItem.push(bullet[1]);
      continue;
    }
    closeList();
    paragraph.push(line);
  }

  closeParagraph();
  closeList();
  return output.join("\n    ");
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function updateArtifactContentType(path) {
  if (path.endsWith(".zip")) {
    return "application/zip";
  }

  return "application/octet-stream";
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

function siteRootUrl(metadata) {
  const url = new URL(metadata.appcastUrl);
  url.pathname = url.pathname.replace(/\/?menu-bar\/appcast\.xml$/, "/");
  return url.toString();
}

function sitePageUrl(metadata, path = "") {
  return new URL(path, siteRootUrl(metadata)).toString();
}

function releasePageUrl(tag) {
  return `https://github.com/gormanity/ytm-enhancer/releases/tag/${tag}`;
}

function packageUrl({ metadata, releaseBaseUrl, packageName }) {
  const tag = `${metadata.githubReleaseTagPrefix}${metadata.version}`;
  return `${releaseBaseUrl}/${tag}/${packageName}`;
}

function windowsTrayInstallerAsset(metadata) {
  return `${metadata.assetPrefix}-${metadata.version}-Setup.exe`;
}

function windowsTrayInstallerUrl({ metadata, releaseBaseUrl }) {
  return (
    process.env.YTM_WINDOWS_TRAY_INSTALLER_URL ??
    packageUrl({
      metadata,
      releaseBaseUrl,
      packageName: windowsTrayInstallerAsset(metadata),
    })
  );
}

function windowsTrayInstallerAvailable() {
  const configured =
    process.env.YTM_WINDOWS_TRAY_INSTALLER_AVAILABLE?.trim().toLowerCase();
  return configured === undefined || !["0", "false", "no"].includes(configured);
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

function readCliProtocolVersion() {
  const protocolSource = readFileSync(
    resolve(repoRoot, "apps/cli/internal/protocol/protocol.go"),
    "utf-8",
  );
  const match = protocolSource.match(/ProtocolVersion\s+=\s+"([^"]+)"/);

  return match?.[1] ?? "unknown";
}

function readCliVersion() {
  const protocolSource = readFileSync(
    resolve(repoRoot, "apps/cli/internal/protocol/protocol.go"),
    "utf-8",
  );
  const match = protocolSource.match(/ConnectorVersion\s+=\s+"([^"]+)"/);

  return process.env.YTM_CLI_VERSION ?? match?.[1] ?? "unknown";
}

function cliReleaseAvailable() {
  const configured =
    process.env.YTM_CLI_RELEASE_AVAILABLE?.trim().toLowerCase();
  return ["1", "true", "yes"].includes(configured ?? "");
}

function cliReleasePackages({ releaseBaseUrl, version }) {
  const tag = `cli-v${version}`;
  const assets = {
    linuxArm64: `YTM-Enhancer-CLI-${version}-linux-arm64.tar.gz`,
    linuxX64: `YTM-Enhancer-CLI-${version}-linux-x64.tar.gz`,
    macosArm64: `YTM-Enhancer-CLI-${version}-macos-arm64.zip`,
    macosX64: `YTM-Enhancer-CLI-${version}-macos-x64.zip`,
  };

  return Object.fromEntries(
    Object.entries(assets).map(([runtime, asset]) => [
      runtime,
      {
        asset,
        packageUrl: `${releaseBaseUrl}/${tag}/${asset}`,
      },
    ]),
  );
}

function cliReleaseChecksumUrl({ releaseBaseUrl, version }) {
  return (
    process.env.YTM_CLI_CHECKSUM_URL?.trim() ||
    `${releaseBaseUrl}/cli-v${version}/SHA256SUMS`
  );
}

function readWindowsTrayMetadata() {
  const metadata = readJson(
    resolve(repoRoot, "apps/windows-tray/release/metadata.json"),
  );
  const version = process.env.YTM_WINDOWS_TRAY_VERSION;
  const buildNumber = process.env.YTM_WINDOWS_TRAY_BUILD_NUMBER;

  if ((version === undefined) !== (buildNumber === undefined)) {
    throw new Error(
      "YTM_WINDOWS_TRAY_VERSION and YTM_WINDOWS_TRAY_BUILD_NUMBER must be set together.",
    );
  }

  return version === undefined
    ? metadata
    : { ...metadata, version, buildNumber };
}

function extensionStoreUrls() {
  return {
    chrome:
      "https://chromewebstore.google.com/detail/ytm-enhancer/bilcedjabgiedoamakekncokccabdccp",
    edge: "https://microsoftedge.microsoft.com/addons/detail/ytm-enhancer/gamefnibdabclmkngggcjghpbhjmajkm",
    firefox: "https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/",
  };
}

function writeReleaseIndex({ metadata, outputPath, releaseBaseUrl }) {
  const extensionVersion = readExtensionVersion();
  const cliProtocolVersion = readCliProtocolVersion();
  const cliVersion = readCliVersion();
  const cliAvailable = cliReleaseAvailable();
  const cliTag = `cli-v${cliVersion}`;
  const cliPackages = cliReleasePackages({
    releaseBaseUrl,
    version: cliVersion,
  });
  const cliChecksumUrl = cliReleaseChecksumUrl({
    releaseBaseUrl,
    version: cliVersion,
  });
  const windowsTrayMetadata = readWindowsTrayMetadata();
  const extensionTag = `v${extensionVersion}`;
  const menuBarTag = `${metadata.githubReleaseTagPrefix}${metadata.version}`;
  const windowsTrayTag = `${windowsTrayMetadata.githubReleaseTagPrefix}${windowsTrayMetadata.version}`;
  const directPackageName = `YTM-Menu-Bar-${metadata.version}.pkg`;
  const homebrewPackageName = `YTM-Menu-Bar-Homebrew-${metadata.version}.pkg`;
  const windowsTrayInstaller = windowsTrayInstallerAsset(windowsTrayMetadata);
  const windowsTrayPackageUrl = windowsTrayInstallerUrl({
    metadata: windowsTrayMetadata,
    releaseBaseUrl,
  });
  const windowsInstallerAvailable = windowsTrayInstallerAvailable();
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
        installPage: sitePageUrl(metadata),
        stores: extensionStoreUrls(),
        updateSources: ["browser-stores", "github-release-assets"],
      },
      connectedApps: {
        id: "connected-apps",
        name: "Connected Apps Beta",
        installPage: sitePageUrl(metadata, "connected-apps/"),
        status: "beta",
        products: ["menu-bar", "windows-tray", "cli"],
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
      windowsTray: {
        id: "windows-tray",
        name: windowsTrayMetadata.appName,
        latestVersion: windowsTrayMetadata.version,
        buildNumber: windowsTrayMetadata.buildNumber,
        tag: windowsTrayTag,
        releaseUrl: releasePageUrl(windowsTrayTag),
        installPage: windowsTrayMetadata.installUrl,
        releaseList: windowsTrayMetadata.githubReleaseListUrl,
        minimumWindowsVersion: windowsTrayMetadata.minimumWindowsVersion,
        installerAvailable: windowsInstallerAvailable,
        channels: windowsInstallerAvailable
          ? {
              direct: {
                asset: windowsTrayInstaller,
                packageUrl: windowsTrayPackageUrl,
                runtimes: windowsTrayMetadata.runtimes,
                releaseList: windowsTrayMetadata.githubReleaseListUrl,
              },
            }
          : {},
      },
      cli: cliAvailable
        ? {
            id: "cli",
            name: "YTM Enhancer CLI",
            latestVersion: cliVersion,
            tag: cliTag,
            releaseUrl: releasePageUrl(cliTag),
            checksumUrl: cliChecksumUrl,
            protocolVersion: cliProtocolVersion,
            installPage: sitePageUrl(metadata, "cli/"),
            distribution: "github-release-assets",
            channels: {
              direct: {
                packages: cliPackages,
              },
            },
          }
        : {
            id: "cli",
            name: "YTM Enhancer CLI",
            protocolVersion: cliProtocolVersion,
            installPage: sitePageUrl(metadata, "cli/"),
            distribution: "source",
          },
    },
  };

  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return indexPath;
}

function readExtensionIconSvg() {
  return readFileSync(
    resolve(
      appRoot,
      "Sources/YTMMenuBarConnector/Resources/extension-icon.svg",
    ),
    "utf-8",
  );
}

function siteCss() {
  return `
      :root {
        color-scheme: dark;
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        background: #090909;
        color: #f5f5f6;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background: linear-gradient(135deg, #121217 0%, #080808 64%, #151315 100%);
      }

      a {
        color: inherit;
      }

      img {
        max-width: 100%;
      }

      .site-shell {
        width: min(1120px, calc(100% - 40px));
        margin: 0 auto;
      }

      .site-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
        padding: 24px 0;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: 12px;
        font-size: 16px;
        font-weight: 800;
        text-decoration: none;
      }

      .brand-mark {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.08);
      }

      .brand-mark svg {
        width: 28px;
        height: 28px;
      }

      .site-nav {
        display: flex;
        flex-wrap: wrap;
        justify-content: flex-end;
        gap: 8px;
      }

      .site-nav a,
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        border: 1px solid rgb(255 255 255 / 0.14);
        border-radius: 8px;
        text-decoration: none;
      }

      .site-nav a {
        padding: 0 12px;
        color: #d7d7de;
        font-size: 14px;
        font-weight: 700;
      }

      .hero {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 520px);
        gap: 54px;
        align-items: center;
        min-height: min(680px, calc(100vh - 96px));
        padding: 42px 0 56px;
      }

      .hero-narrow {
        min-height: auto;
        padding-bottom: 34px;
      }

      .eyebrow {
        margin: 0 0 14px;
        color: #b9bbc7;
        font-size: 14px;
        font-weight: 800;
        letter-spacing: 0;
        text-transform: uppercase;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        max-width: 780px;
        font-size: 68px;
        line-height: 0.98;
      }

      h2 {
        font-size: 32px;
        line-height: 1.1;
      }

      h3 {
        font-size: 18px;
      }

      .lede {
        max-width: 690px;
        margin-top: 22px;
        color: #d2d2da;
        font-size: 20px;
        line-height: 1.45;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 30px;
      }

      .button {
        min-height: 48px;
        padding: 0 18px;
        background: rgb(255 255 255 / 0.08);
        font-size: 15px;
        font-weight: 850;
      }

      .button-primary {
        border-color: #ff2a2a;
        background: #ff2a2a;
        color: #fff;
      }

      .button-secondary {
        border-color: rgb(48 196 182 / 0.44);
        color: #ecfffd;
      }

      .visual-stack {
        display: grid;
        gap: 18px;
      }

      .visual-frame,
      .terminal-frame,
      .video-frame {
        min-width: 0;
        overflow: hidden;
        border: 1px solid rgb(255 255 255 / 0.13);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.06);
        box-shadow: 0 28px 88px rgb(0 0 0 / 0.35);
      }

      .visual-frame img {
        display: block;
        width: 100%;
        height: auto;
      }

      .video-frame video {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 16 / 9;
        background: #050506;
      }

      .terminal-frame {
        padding: 22px;
      }

      .terminal-frame code {
        display: block;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        color: #f6f6f7;
        font-family:
          ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 14px;
        line-height: 1.55;
      }

      .section {
        padding: 42px 0;
      }

      .section-header {
        max-width: 760px;
        margin-bottom: 20px;
      }

      .section-header p {
        margin-top: 10px;
        color: #c5c6cf;
        font-size: 17px;
        line-height: 1.5;
      }

      .card-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
      }

      .card {
        min-width: 0;
        min-height: 100%;
        padding: 20px;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.06);
      }

      .card p,
      .meta-list {
        margin-top: 10px;
        color: #c9c9d2;
        font-size: 15px;
        line-height: 1.52;
      }

      .card-link {
        display: inline-flex;
        margin-top: 16px;
        color: #ffffff;
        font-weight: 800;
      }

      .beta-note {
        margin-top: 24px;
        padding: 18px 20px;
        border: 1px solid rgb(255 194 71 / 0.32);
        border-radius: 8px;
        background: rgb(255 194 71 / 0.1);
        color: #ffe7b0;
        font-size: 15px;
        line-height: 1.5;
      }

      .split {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(320px, 480px);
        gap: 34px;
        align-items: start;
      }

      .split > * {
        min-width: 0;
      }

      .meta-list {
        display: grid;
        gap: 8px;
        padding: 0;
        list-style: none;
      }

      .site-footer {
        padding: 36px 0 50px;
        color: #9fa0aa;
        font-size: 14px;
      }

      @media (max-width: 850px) {
        .site-shell {
          width: min(100% - 32px, 520px);
        }

        .site-header {
          align-items: flex-start;
          flex-direction: column;
        }

        .site-nav {
          justify-content: flex-start;
        }

        .hero,
        .split {
          grid-template-columns: 1fr;
        }

        .hero {
          min-height: auto;
          gap: 32px;
          padding-top: 24px;
        }

        h1 {
          font-size: 44px;
        }

        .lede {
          font-size: 18px;
        }

        .card-grid {
          grid-template-columns: 1fr;
        }

        .actions {
          align-items: stretch;
          flex-direction: column;
        }
      }
`;
}

function siteHeader({ iconSvg, current = "" }) {
  const nav = [
    ["Extension", "./"],
    ["Connected Apps", "connected-apps/"],
    ["macOS", "menu-bar/install.html"],
    ["Windows", "windows-tray/install.html"],
    ["CLI", "cli/"],
  ];

  return `<header class="site-header">
        <a class="brand" href="${current === "home" ? "./" : "../"}">
          <span class="brand-mark" aria-hidden="true">${iconSvg}</span>
          <span>YTM Enhancer</span>
        </a>
        <nav class="site-nav" aria-label="Product pages">
          ${nav
            .map(([label, href]) => {
              const prefix = current === "home" ? "" : "../";
              return `<a href="${prefix}${href}">${label}</a>`;
            })
            .join("\n          ")}
        </nav>
      </header>`;
}

function siteDocument({ title, description, iconSvg, current, body }) {
  const faviconHref = current === "home" ? "favicon.svg" : "../favicon.svg";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="description" content="${escapeHtml(description)}">
    <link rel="icon" type="image/svg+xml" href="${faviconHref}">
    <title>${escapeHtml(title)}</title>
    <style>${siteCss()}</style>
  </head>
  <body>
    <div class="site-shell">
      ${siteHeader({ iconSvg, current })}
      ${body}
      <footer class="site-footer">
        YTM Enhancer is private by design: no analytics, no tracking, and no
        project-operated backend services.
      </footer>
    </div>
  </body>
</html>
`;
}

function writeSiteAsset({ siteRoot, sourcePath, fileName }) {
  const assetDir = resolve(siteRoot, "assets");
  mkdirSync(assetDir, { recursive: true });
  copyFileSync(sourcePath, resolve(assetDir, fileName));
}

function siteAssetUrl(path, sourcePath) {
  return `${path}?v=${sha256(sourcePath).slice(0, 12)}`;
}

function writeSitePage(path, html) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, html);
}

function writeSitePages({ metadata, outputPath, releaseBaseUrl }) {
  const siteRoot = resolve(dirname(outputPath), "..");
  const iconSvg = readExtensionIconSvg();
  const extensionVersion = readExtensionVersion();
  const cliVersion = readCliVersion();
  const cliAvailable = cliReleaseAvailable();
  const cliTag = `cli-v${cliVersion}`;
  const cliPackages = cliReleasePackages({
    releaseBaseUrl,
    version: cliVersion,
  });
  const cliChecksumUrl = cliReleaseChecksumUrl({
    releaseBaseUrl,
    version: cliVersion,
  });
  const cliInstallIntro = cliAvailable
    ? `Download the package for your operating system and architecture,
                extract it, and run the included installer. It installs for
                your user account without requiring Go or elevated access.`
    : `Signed packages are still being prepared. Contributors can build the
                CLI from a local checkout with Go 1.24 until downloads are
                available.`;
  const cliInstallContent = cliAvailable
    ? `<div class="card-grid" id="downloads">
              <article class="card">
                <h3>macOS Apple silicon</h3>
                <p>For M-series Macs.</p>
                <a class="card-link" href="${escapeHtml(cliPackages.macosArm64.packageUrl)}">Download arm64</a>
              </article>
              <article class="card">
                <h3>macOS Intel</h3>
                <p>For Intel-based Macs.</p>
                <a class="card-link" href="${escapeHtml(cliPackages.macosX64.packageUrl)}">Download x64</a>
              </article>
              <article class="card">
                <h3>Linux arm64</h3>
                <p>For 64-bit Arm Linux systems.</p>
                <a class="card-link" href="${escapeHtml(cliPackages.linuxArm64.packageUrl)}">Download arm64</a>
              </article>
              <article class="card">
                <h3>Linux x64</h3>
                <p>For 64-bit Intel and AMD Linux systems.</p>
                <a class="card-link" href="${escapeHtml(cliPackages.linuxX64.packageUrl)}">Download x64</a>
              </article>
            </div>
            <p>
              <a class="card-link" href="${escapeHtml(cliChecksumUrl)}">Download SHA256SUMS</a>
              and verify the archive before installing.
            </p>
            <p><strong>macOS</strong></p>
            <figure class="terminal-frame" aria-label="macOS CLI install commands">
              <code>archive=YTM-Enhancer-CLI-${escapeHtml(cliVersion)}-macos-arm64.zip # use macos-x64 on Intel
grep -F "  $archive" SHA256SUMS | shasum -a 256 -c -
unzip "$archive"
cd "\${archive%.zip}"
./install.sh
~/.local/bin/ytme doctor</code>
            </figure>
            <p><strong>Linux</strong></p>
            <figure class="terminal-frame" aria-label="Linux CLI install commands">
              <code>archive=YTM-Enhancer-CLI-${escapeHtml(cliVersion)}-linux-x64.tar.gz # use linux-arm64 on Arm
grep -F "  $archive" SHA256SUMS | sha256sum -c -
tar -xzf "$archive"
cd "\${archive%.tar.gz}"
./install.sh
~/.local/bin/ytme doctor</code>
            </figure>`
    : `<p class="beta-note">
              The first signed public packages are being prepared. Downloads
              will appear here as soon as the CLI release finishes. Until then,
              use the source-install commands below.
            </p>
            <figure class="terminal-frame" aria-label="CLI source install commands">
              <code>git clone https://github.com/gormanity/ytm-enhancer.git
cd ytm-enhancer
apps/cli/scripts/install-native-hosts.sh</code>
            </figure>`;
  const windowsTrayMetadata = readWindowsTrayMetadata();
  const stores = extensionStoreUrls();
  const windowsInstallerUrl = windowsTrayInstallerUrl({
    metadata: windowsTrayMetadata,
    releaseBaseUrl,
  });
  const windowsInstallerAvailable = windowsTrayInstallerAvailable();
  const windowsDownloadLabel = windowsInstallerAvailable
    ? "Download for Windows"
    : "View current Windows release";
  const windowsSetupCopy = windowsInstallerAvailable
    ? "Download and run the signed installer, then enable Connected Apps from the YTM Enhancer extension popup. The installer selects the native x64 or ARM64 build and opens YTM Tray automatically."
    : "The unified installer is not yet available in this published release. View the current release page for available Windows downloads.";
  const windowsArchitectureCopy = windowsInstallerAvailable
    ? "Architectures: x64 and ARM64 (selected automatically)"
    : "Architectures: x64 and ARM64";
  const cliCardLinkLabel = cliAvailable
    ? "Download for macOS or Linux"
    : "View CLI setup";
  const windowsTrayScreenshotSourcePath = resolve(
    repoRoot,
    "apps/windows-tray/release/windows-tray-screenshot.png",
  );
  const windowsTrayScreenshotUrl = siteAssetUrl(
    "../assets/windows-tray-screenshot.png",
    windowsTrayScreenshotSourcePath,
  );

  writeSiteAsset({
    siteRoot,
    sourcePath: resolve(repoRoot, "store/screenshots/01-playback-controls.png"),
    fileName: "playback-controls.png",
  });
  writeSiteAsset({
    siteRoot,
    sourcePath: resolve(repoRoot, "store/screenshots/02-mini-player.png"),
    fileName: "mini-player.png",
  });
  writeSiteAsset({
    siteRoot,
    sourcePath: resolve(appRoot, "release/menu-bar-screenshot.png"),
    fileName: "menu-bar-screenshot.png",
  });
  writeSiteAsset({
    siteRoot,
    sourcePath: windowsTrayScreenshotSourcePath,
    fileName: "windows-tray-screenshot.png",
  });
  writeSiteAsset({
    siteRoot,
    sourcePath: resolve(repoRoot, "apps/cli/release/cli-demo.webm"),
    fileName: "cli-demo.webm",
  });
  writeSiteAsset({
    siteRoot,
    sourcePath: resolve(repoRoot, "apps/cli/release/cli-demo-poster.png"),
    fileName: "cli-demo-poster.png",
  });
  writeFileSync(resolve(siteRoot, ".nojekyll"), "");
  writeFileSync(resolve(siteRoot, "favicon.svg"), iconSvg);

  writeSitePage(
    resolve(siteRoot, "index.html"),
    siteDocument({
      title: "YTM Enhancer",
      description:
        "Upgrade YouTube Music with smarter controls, automation, a mini player, and optional menu bar, system tray, and terminal controls.",
      iconSvg,
      current: "home",
      body: `<main>
        <section class="hero" aria-labelledby="title">
          <div>
            <p class="eyebrow">Extension plus optional desktop controls</p>
            <h1 id="title">YTM Enhancer</h1>
            <p class="lede">
              Make YouTube Music work the way you listen with smarter playback
              controls, automation, notifications, a compact mini player, and
              optional controls outside the browser.
            </p>
            <div class="actions" aria-label="Install YTM Enhancer">
              <a class="button button-primary" href="${escapeHtml(stores.chrome)}">Chrome Web Store</a>
              <a class="button" href="${escapeHtml(stores.edge)}">Microsoft Edge Add-ons</a>
              <a class="button" href="${escapeHtml(stores.firefox)}">Firefox Add-ons</a>
              <a class="button button-secondary" href="connected-apps/">Connected Apps Beta</a>
            </div>
          </div>
          <figure class="visual-frame">
            <img
              src="assets/playback-controls.png"
              alt="YTM Enhancer playback controls inside the extension popup"
            >
          </figure>
        </section>

        <section class="section" aria-labelledby="products-title">
          <div class="section-header">
            <h2 id="products-title">Install What You Need</h2>
            <p>
              Start with the browser extension, then add the optional app that
              matches how you listen.
            </p>
          </div>
          <div class="card-grid">
            <article class="card">
              <h3>Browser Extension</h3>
              <p>
                Playback controls, hotkeys, Mini Player, notifications, sleep
                timer, and YouTube Music automation in Chrome, Edge, and Firefox.
              </p>
              <a class="card-link" href="${escapeHtml(stores.chrome)}">Install extension</a>
            </article>
            <article class="card">
              <h3>Connected Apps Beta</h3>
              <p>
                See what is playing and control YouTube Music from the macOS
                menu bar, Windows system tray, or terminal. Turn it on only
                when you install one of these optional apps.
              </p>
              <a class="card-link" href="connected-apps/">View companion apps</a>
            </article>
            <article class="card">
              <h3>Stay Current</h3>
              <p>
                Browser stores update extension version
                ${escapeHtml(extensionVersion)} automatically. Each optional
                app also provides updates through its own install channel.
              </p>
              <a class="card-link" href="connected-apps/">Choose an optional app</a>
            </article>
          </div>
        </section>

        <section class="section split" aria-labelledby="desktop-title">
          <div>
            <div class="section-header">
              <h2 id="desktop-title">Built Around YouTube Music</h2>
              <p>
                YTM Enhancer keeps YouTube Music in your browser and layers
                optional controls around it. The extension owns page access,
                and companion apps communicate locally only after you approve
                them.
              </p>
            </div>
            <div class="beta-note">
              Connected Apps are beta. They are intended for early users who
              want native desktop controls and are comfortable installing a
              companion app.
            </div>
          </div>
          <figure class="visual-frame">
            <img
              src="assets/mini-player.png"
              alt="YTM Enhancer Mini Player showing compact playback controls"
            >
          </figure>
        </section>
      </main>`,
    }),
  );

  writeSitePage(
    resolve(siteRoot, "connected-apps/index.html"),
    siteDocument({
      title: "Connected Apps Beta for YTM Enhancer",
      description:
        "See what is playing and control YouTube Music from the macOS menu bar, Windows system tray, or terminal.",
      iconSvg,
      current: "connected-apps",
      body: `<main>
        <section class="hero hero-narrow" aria-labelledby="title">
          <div>
            <p class="eyebrow">Optional controls outside the browser</p>
            <h1 id="title">Connected Apps Beta</h1>
            <p class="lede">
              Keep playback close with now-playing details and controls in the
              macOS menu bar, Windows system tray, or your terminal.
            </p>
            <div class="actions" aria-label="Connected Apps downloads">
              <a class="button button-primary" href="../menu-bar/install.html">Install for macOS</a>
              <a class="button" href="../windows-tray/install.html">Install for Windows</a>
              <a class="button" href="../cli/">Use the CLI</a>
            </div>
            <p class="beta-note">
              Connected Apps are in beta. Use the browser extension popup to
              enable the feature and choose which apps may connect.
            </p>
          </div>
          <div class="visual-stack">
            <figure class="visual-frame">
              <img
                src="../assets/menu-bar-screenshot.png"
                alt="YTM Menu Bar connected app showing playback controls"
              >
            </figure>
            <figure class="visual-frame">
              <img
                src="${windowsTrayScreenshotUrl}"
                alt="YTM Tray connected app showing Windows playback controls"
              >
            </figure>
          </div>
        </section>

        <section class="section" aria-labelledby="apps-title">
          <div class="section-header">
            <h2 id="apps-title">Choose Your App</h2>
            <p>
              Each app requests the same limited playback permissions and only
              connects after Connected Apps is enabled in the extension.
            </p>
          </div>
          <div class="card-grid">
            <article class="card">
              <h3>YTM Menu Bar</h3>
              <p>
                See what is playing, control playback, and open or focus
                YouTube Music from the macOS menu bar.
              </p>
              <a class="card-link" href="../menu-bar/install.html">Download for macOS</a>
            </article>
            <article class="card">
              <h3>YTM Tray</h3>
              <p>
                See what is playing and control YouTube Music from the Windows
                system tray on ${escapeHtml(windowsTrayMetadata.minimumWindowsVersion)}.
              </p>
              <a class="card-link" href="../windows-tray/install.html">Install for Windows</a>
            </article>
            <article class="card">
              <h3>YTM Enhancer CLI</h3>
              <p>
                Command-line playback controls for users who want scriptable
                YouTube Music actions.
              </p>
              <a class="card-link" href="../cli/">${cliCardLinkLabel}</a>
            </article>
          </div>
        </section>

        <section class="section" aria-labelledby="browser-support-title">
          <div class="section-header">
            <h2 id="browser-support-title">Browser Support</h2>
            <p>
              Connected Apps support depends on both the extension browser and
              the app you install.
            </p>
          </div>
          <div class="card-grid">
            <article class="card">
              <h3>macOS</h3>
              <p>
                YTM Menu Bar installs native messaging manifests for Chrome,
                Chromium, Microsoft Edge, and Firefox.
              </p>
            </article>
            <article class="card">
              <h3>CLI</h3>
              <p>
                The CLI installer supports Chrome, Chromium, Microsoft Edge,
                Brave, and Firefox on macOS and Linux.
              </p>
            </article>
            <article class="card">
              <h3>Windows</h3>
              <p>
                YTM Tray currently supports Chrome, Microsoft Edge, and Firefox.
              </p>
            </article>
          </div>
          <p class="beta-note">
            All three apps communicate locally with the extension. You decide
            which apps may connect and can turn off access at any time.
          </p>
        </section>
      </main>`,
    }),
  );

  writeSitePage(
    resolve(siteRoot, "windows-tray/install.html"),
    siteDocument({
      title: "YTM Tray for Windows",
      description:
        "See what is playing and control YouTube Music from the Windows system tray.",
      iconSvg,
      current: "windows-tray",
      body: `<main>
        <section class="hero" aria-labelledby="title">
          <div>
            <p class="eyebrow">Connected Apps Beta for Windows</p>
            <h1 id="title">YTM Tray</h1>
            <p class="lede">
              Add YouTube Music playback status and controls to the Windows
              system tray while the browser extension keeps page access scoped
              to YouTube Music.
            </p>
            <div class="actions" aria-label="Install YTM Tray">
              <a class="button button-primary" href="${escapeHtml(windowsInstallerUrl)}">${escapeHtml(windowsDownloadLabel)}</a>
              <a class="button" href="../connected-apps/">Connected Apps Beta</a>
              <a class="button" href="#uninstall">Uninstall</a>
            </div>
            <p class="beta-note">
              YTM Tray is part of the Connected Apps beta.
              The tray app, native host, and installer are signed through
              Microsoft Artifact Signing.
              See the <a href="https://github.com/gormanity/ytm-enhancer/blob/main/docs/code-signing-policy.md">code signing policy</a>.
            </p>
          </div>
          <figure class="visual-frame">
            <img
              src="${windowsTrayScreenshotUrl}"
              alt="YTM Tray app showing playback controls in a Windows system tray popup"
            >
          </figure>
        </section>

        <section class="section split" aria-labelledby="setup-title">
          <div>
            <div class="section-header">
              <h2 id="setup-title">Setup</h2>
              <p>
                ${windowsSetupCopy}
              </p>
            </div>
            <ul class="meta-list" aria-label="YTM Tray details">
              <li>Latest version: ${escapeHtml(windowsTrayMetadata.version)}</li>
              <li>Minimum Windows version: ${escapeHtml(windowsTrayMetadata.minimumWindowsVersion)}</li>
              <li>Browser support: Chrome, Microsoft Edge, and Firefox</li>
              <li>${windowsArchitectureCopy}</li>
              <li>Updates: available from the About window</li>
            </ul>
          </div>
          <article class="card">
            <h3>What It Can Access</h3>
            <p>
              YTM Tray connects through the extension's native messaging host.
              It can read playback details, control playback, and focus YouTube
              Music after you approve Connected Apps in the extension.
            </p>
          </article>
        </section>

        <section class="section split" id="uninstall" aria-labelledby="uninstall-title">
          <div>
            <div class="section-header">
              <h2 id="uninstall-title">Uninstall</h2>
              <p>
                The installer registers YTM Tray as a user-level Windows app.
                Remove it from Windows Settings or the Start Menu. The installed
                <code>YTMTray.Setup.exe</code> also supports uninstallation.
              </p>
            </div>
            <ul class="meta-list" aria-label="YTM Tray uninstall options">
              <li>Windows Settings > Apps > Installed apps > YTM Tray > Uninstall</li>
              <li>Start Menu > YTM Enhancer > Uninstall YTM Tray</li>
            </ul>
          </div>
          <article class="card">
            <h3>What Gets Removed</h3>
            <p>
              The uninstaller closes YTM Tray, removes Chrome, Edge, and Firefox
              native messaging registration, removes Start Menu shortcuts, and
              deletes the installed app files from Local AppData.
            </p>
          </article>
        </section>
      </main>`,
    }),
  );

  writeSitePage(
    resolve(siteRoot, "cli/index.html"),
    siteDocument({
      title: "YTM Enhancer CLI",
      description:
        "See what is playing and control YouTube Music from a macOS or Linux terminal.",
      iconSvg,
      current: "cli",
      body: `<main>
        <section class="hero" aria-labelledby="title">
          <div>
            <p class="eyebrow">Connected Apps Beta for macOS and Linux</p>
            <h1 id="title">YTM Enhancer CLI</h1>
            <p class="lede">
              Check playback, control YouTube Music, and build shell
              integrations without switching back to the browser.
            </p>
            <div class="actions" aria-label="CLI resources">
              <a class="button button-primary" href="#install-title">Install for macOS/Linux</a>
              <a class="button" href="../connected-apps/">Connected Apps Beta</a>
            </div>
          </div>
          <figure class="video-frame" aria-label="CLI demo video">
            <video autoplay muted loop playsinline poster="../assets/cli-demo-poster.png">
              <source src="../assets/cli-demo.webm" type="video/webm">
            </video>
          </figure>
        </section>

        <section class="section split" aria-labelledby="install-title">
          <div>
            <div class="section-header">
              <h2 id="install-title">Install</h2>
              <p>
                ${cliInstallIntro}
              </p>
            </div>
            ${cliInstallContent}
          </div>
          <div class="visual-stack">
            <article class="card">
              <h3>What It Can Access</h3>
              <p>
                After you approve it in Connected Apps, the CLI can read
                playback details, control playback, and open or focus YouTube
                Music. Communication stays local to your device.
              </p>
              ${
                cliAvailable
                  ? `<a class="card-link" href="${escapeHtml(releasePageUrl(cliTag))}">
                View release ${escapeHtml(cliVersion)}
              </a>`
                  : ""
              }
            </article>
            <article class="card">
              <h3>Browser Support</h3>
              <p>
                The macOS and Linux CLI installer writes native messaging
                manifests for Chrome, Chromium, Microsoft Edge, Brave, and
                Firefox.
              </p>
            </article>
          </div>
        </section>
      </main>`,
    }),
  );
}

function writeDefaultReleaseNotes({ metadata, outputPath }) {
  const notesPath = resolve(
    dirname(outputPath),
    "release-notes",
    `${metadata.version}.html`,
  );
  const curatedNotesPath = resolve(
    appRoot,
    "release",
    "notes",
    `${metadata.version}.md`,
  );
  const curatedNotes = fileHasContent(curatedNotesPath)
    ? readFileSync(curatedNotesPath, "utf-8")
    : "";
  const notesBody = curatedNotes
    ? renderReleaseNotesMarkdown(curatedNotes)
    : `<p>This release keeps the menu bar companion app up to date with YTM Enhancer.</p>
    <ul>
      <li>Includes the latest menu bar app improvements and maintenance fixes.</li>
      <li>Recommended for all direct-install users.</li>
    </ul>`;
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

      h2 {
        margin: 24px 0 12px;
        font-size: 20px;
      }

      h3 {
        margin: 20px 0 8px;
        font-size: 17px;
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

      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(metadata.appName)} ${escapeHtml(metadata.version)}</h1>
    ${notesBody}
  </body>
</html>
`;

  mkdirSync(dirname(notesPath), { recursive: true });
  writeFileSync(notesPath, notesHtml);
  return notesPath;
}

function releaseNotesPath({ metadata, outputPath }) {
  return resolve(
    dirname(outputPath),
    "release-notes",
    `${metadata.version}.html`,
  );
}

function fileHasContent(path) {
  try {
    return statSync(path).size > 0;
  } catch {
    return false;
  }
}

function writeDefaultReleaseNotesIfMissing({ metadata, outputPath }) {
  const notesPath = releaseNotesPath({ metadata, outputPath });
  if (fileHasContent(notesPath)) {
    return notesPath;
  }

  return writeDefaultReleaseNotes({ metadata, outputPath });
}

function writeInstallPage({ metadata, outputPath, releaseBaseUrl }) {
  const installPath = resolve(dirname(outputPath), "install.html");
  const iconSvg = readExtensionIconSvg();
  const faviconFileName = "favicon.svg";
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
    <link rel="icon" type="image/svg+xml" href="./${escapeHtml(faviconFileName)}">
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

      .button-danger {
        border-color: rgb(255 31 31 / 0.36);
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
        scroll-margin-top: 28px;
        min-height: 100%;
        padding: 22px;
        border: 1px solid rgb(255 255 255 / 0.12);
        border-radius: 8px;
        background: rgb(255 255 255 / 0.06);
      }

      .panel:target {
        border-color: rgb(255 31 31 / 0.46);
        background: rgb(255 31 31 / 0.08);
        box-shadow: 0 0 0 1px rgb(255 31 31 / 0.18);
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
          <p class="eyebrow">Connected Apps Beta for macOS</p>
          <h1 id="title">${escapeHtml(metadata.appName)}</h1>
          <p class="summary">
            See what is playing and control YouTube Music from the macOS menu
            bar without switching back to the browser.
          </p>
          <div class="actions" aria-label="Install options">
            <a class="button button-primary" href="${escapeHtml(directUrl)}">
              Download for macOS
            </a>
            <a class="button" href="${escapeHtml(releaseNotesUrl)}">Release notes</a>
            <a class="button button-danger" href="#uninstall">
              Uninstall instructions
            </a>
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
          <h2>Browser Support</h2>
          <p>
            Works with YTM Enhancer in Chrome, Chromium, Microsoft Edge, and
            Firefox on macOS.
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
        <article class="panel" id="uninstall">
          <h2>Uninstall</h2>
          <p>
            Direct package installs include an uninstaller in Applications.
            Open it to remove the app, native messaging host, and package
            receipt. Homebrew installs uninstall through Homebrew.
          </p>
          <code>/Applications/YTM Menu Bar Uninstaller.command</code>
          <code>brew uninstall --cask ytm-menu-bar</code>
        </article>
        <article class="panel">
          <h2>Privacy</h2>
          <p>
            YTM Menu Bar communicates locally with the YTM Enhancer extension.
            It does not read YouTube Music pages directly.
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
  writeFileSync(resolve(dirname(installPath), faviconFileName), iconSvg);
  writeFileSync(installPath, installHtml);
  return installPath;
}

export function generateLandingPages({
  outputPath = resolve(appRoot, ".build/appcast/menu-bar/appcast.xml"),
  releaseBaseUrl = "https://github.com/gormanity/ytm-enhancer/releases/download",
} = {}) {
  const metadata = readReleaseMetadata();

  mkdirSync(dirname(outputPath), { recursive: true });
  writeDefaultReleaseNotesIfMissing({ metadata, outputPath });
  writeInstallPage({ metadata, outputPath, releaseBaseUrl });
  writeSitePages({ metadata, outputPath, releaseBaseUrl });
  writeReleaseIndex({ metadata, outputPath, releaseBaseUrl });
  return resolve(dirname(outputPath), "..");
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
  const archiveName = basename(archivePath);
  const url = archiveUrl ?? `${releaseBaseUrl}/${tag}/${archiveName}`;
  const notesUrl = releaseNotesUrl ?? defaultReleaseNotesUrl(metadata);
  const length = statSync(archivePath).size;
  const checksum = sha256(archivePath);
  const contentType = updateArtifactContentType(archivePath);
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
        type="${escapeXml(contentType)}" />
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
  writeSitePages({ metadata, outputPath, releaseBaseUrl });
  writeReleaseIndex({ metadata, outputPath, releaseBaseUrl });
  return outputPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const archive = argValue("archive", "");
  const archiveUrl = argValue("archive-url", "");
  const releaseNotesUrl = argValue("release-notes-url", "");
  const outputPath = resolve(
    argValue("output", resolve(appRoot, ".build/appcast/menu-bar/appcast.xml")),
  );
  const releaseBaseUrl = argValue(
    "release-base-url",
    "https://github.com/gormanity/ytm-enhancer/releases/download",
  );

  if (process.argv.includes("--site-only")) {
    const siteRoot = generateLandingPages({
      outputPath,
      releaseBaseUrl,
    });
    console.log(`Wrote product pages to ${siteRoot}`);
  } else {
    const appcastPath = generateAppcast({
      archivePath: archive ? resolve(archive) : "",
      archiveUrl: archiveUrl || undefined,
      edSignature: argValue(
        "ed-signature",
        process.env.SPARKLE_ED_SIGNATURE ?? "",
      ),
      outputPath,
      releaseBaseUrl,
      releaseNotesUrl: releaseNotesUrl || undefined,
    });
    console.log(`Wrote appcast to ${appcastPath}`);
  }
}
