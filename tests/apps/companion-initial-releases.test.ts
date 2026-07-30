import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function readJson<T>(path: string): T {
  return JSON.parse(read(path)) as T;
}

function writeCliPackageFixture(
  packageRoot: string,
  runtime = "linux-x64",
): void {
  mkdirSync(packageRoot, { recursive: true });
  for (const name of ["ytme", "ytme-native-host"]) {
    const path = join(packageRoot, name);
    writeFileSync(path, "#!/bin/sh\nexit 0\n");
    chmodSync(path, 0o755);
  }
  for (const name of ["install.sh", "uninstall.sh"]) {
    const source = resolve(process.cwd(), "apps/cli/release", name);
    expect(existsSync(source)).toBe(true);
    const destination = join(packageRoot, name);
    copyFileSync(source, destination);
    chmodSync(destination, 0o755);
  }
  writeFileSync(join(packageRoot, "VERSION"), "0.1.0\n");
  writeFileSync(join(packageRoot, "RUNTIME"), `${runtime}\n`);
  writeFileSync(join(packageRoot, "LICENSE"), "test license\n");
}

describe("initial public companion releases", () => {
  it("keeps current companion versions aligned with versioned notes", () => {
    const menuMetadata = readJson<{ buildNumber: string; version: string }>(
      "apps/menu-bar/release/metadata.json",
    );
    const trayMetadata = readJson<{ buildNumber: string; version: string }>(
      "apps/windows-tray/release/metadata.json",
    );
    const cliSource = read("apps/cli/internal/protocol/protocol.go");
    const cliVersion = /ConnectorVersion\s+=\s+"([^"]+)"/.exec(cliSource)?.[1];
    const expectedBuild = (version: string) => {
      const [major, minor, patch] = version.split(".").map(Number);
      return String(major * 1_000_000 + minor * 1_000 + patch);
    };

    expect(menuMetadata.buildNumber).toBe(expectedBuild(menuMetadata.version));
    expect(trayMetadata.buildNumber).toBe(expectedBuild(trayMetadata.version));
    expect(
      read("apps/menu-bar/Sources/YTMMenuBarConnector/AppMetadata.swift"),
    ).toContain(`baseVersion = "${menuMetadata.version}"`);
    expect(
      read("apps/windows-tray/src/YTMTray.Core/YTMTray.Core.csproj"),
    ).toContain(`<Version>${trayMetadata.version}</Version>`);
    expect(cliVersion).toMatch(/^\d+\.\d+\.\d+$/);

    for (const notesPath of [
      `apps/menu-bar/release/notes/${menuMetadata.version}.md`,
      `apps/windows-tray/release/notes/${trayMetadata.version}.md`,
      `apps/cli/release/notes/${cliVersion}.md`,
    ]) {
      expect(existsSync(resolve(process.cwd(), notesPath))).toBe(true);
      const notes = read(notesPath);
      expect(notes.trim()).not.toBe("");
      expect(notes).not.toContain("What's Changed");
      expect(notes).not.toContain("Full Changelog");
      expect(notes).not.toMatch(/compare\/|previous release/i);
    }
  });

  it("preserves standalone introductions for the initial public releases", () => {
    for (const notesPath of [
      "apps/menu-bar/release/notes/0.2.0.md",
      "apps/windows-tray/release/notes/0.2.0.md",
      "apps/cli/release/notes/0.1.0.md",
    ]) {
      const notes = read(notesPath);
      expect(notes).toContain("Initial public beta");
      expect(notes).not.toContain("What's Changed");
      expect(notes).not.toContain("Full Changelog");
      expect(notes).not.toMatch(/compare\/|previous release/i);
    }
  });

  it("keeps connection details in the introduction instead of feature bullets", () => {
    const releaseNotes = [
      {
        path: "apps/menu-bar/release/notes/0.2.0.md",
        browsers: "Google Chrome, Chromium, Microsoft Edge, or Firefox",
      },
      {
        path: "apps/windows-tray/release/notes/0.2.0.md",
        browsers: "Google Chrome, Microsoft Edge, or Firefox",
      },
      {
        path: "apps/cli/release/notes/0.1.0.md",
        browsers: "Google Chrome, Chromium, Microsoft Edge, Brave, or Firefox",
      },
    ];

    for (const { path, browsers } of releaseNotes) {
      const [introduction, highlights = ""] =
        read(path).split("### Highlights");
      const normalizedIntroduction = introduction.replace(/\s+/g, " ");

      expect(normalizedIntroduction).toContain(
        "communicates locally and privately with the YTM Enhancer extension",
      );
      expect(normalizedIntroduction).toContain(browsers);
      expect(highlights).not.toMatch(
        /^- (Connect through|Follow the active browser connection|Match the current macOS appearance|Keep playback communication local)/m,
      );
    }
  });

  it("publishes curated component notes instead of generated diffs", () => {
    const menuWorkflow = read(".github/workflows/menu-bar-release.yml");
    const trayWorkflow = read(".github/workflows/windows-tray-release.yml");
    const cliWorkflow = read(".github/workflows/cli-release.yml");

    expect(menuWorkflow).toContain(
      "body_path: apps/menu-bar/release/notes/${{ env.YTM_MENU_BAR_VERSION }}.md",
    );
    expect(trayWorkflow).toContain(
      "body_path: apps/windows-tray/release/notes/${{ env.YTM_WINDOWS_TRAY_VERSION }}.md",
    );
    for (const workflow of [menuWorkflow, trayWorkflow]) {
      expect(workflow).not.toContain("generate_release_notes: true");
      expect(workflow).not.toContain("previous_tag:");
    }

    expect(cliWorkflow).toContain('      - "cli-v*"');
    expect(cliWorkflow).toContain("CLI releases must use cli-vX.Y.Z tags.");
    expect(cliWorkflow).toContain(
      "body_path: apps/cli/release/notes/${{ env.YTM_CLI_VERSION }}.md",
    );
    expect(cliWorkflow).toContain("make_latest: false");
    expect(cliWorkflow).toContain("Import Developer ID certificate");
    expect(cliWorkflow).toContain("Sign macOS CLI payloads");
    expect(cliWorkflow).toContain("Notarize macOS CLI archives");
    expect(menuWorkflow).toContain('metadata_version="$(node -p');
    expect(menuWorkflow).toContain('metadata_build_number="$(node -p');
    expect(menuWorkflow).toContain('notes_path="apps/menu-bar/release/notes/');
    expect(menuWorkflow).toContain('if [ ! -s "$notes_path" ]');
    expect(trayWorkflow).toContain("$metadataVersion =");
    expect(trayWorkflow).toContain("$metadataBuildNumber =");
    expect(trayWorkflow).toContain("$notesPath =");
    expect(trayWorkflow).toContain("Test-Path -LiteralPath $notesPath");
    expect(cliWorkflow).toContain(
      'notes_path="apps/cli/release/notes/${version}.md"',
    );
    expect(cliWorkflow).toContain('if [ ! -s "$notes_path" ]');
    expect(cliWorkflow).not.toContain("generate_release_notes: true");
    expect(cliWorkflow).not.toContain("previous_tag:");
  });

  it("packages prebuilt CLI binaries for macOS and Linux", () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>(
      "package.json",
    );
    const packageScript = read("apps/cli/scripts/package-release.mjs");
    const installScript = read("apps/cli/release/install.sh");
    const metadata = readJson<{
      githubReleaseTagPrefix: string;
      runtimes: string[];
    }>("apps/cli/release/metadata.json");

    expect(packageJson.scripts["cli:package"]).toBe(
      "node apps/cli/scripts/package-release.mjs",
    );
    expect(metadata.githubReleaseTagPrefix).toBe("cli-v");
    expect(metadata.runtimes).toEqual([
      "macos-x64",
      "macos-arm64",
      "linux-x64",
      "linux-arm64",
    ]);
    expect(packageScript).toContain("CGO_ENABLED");
    expect(packageScript).toContain("GOOS");
    expect(packageScript).toContain("GOARCH");
    expect(packageScript).toContain("metadata.assetPrefix");
    expect(packageScript).toContain("SHA256SUMS");
    expect(packageScript).toContain('"RUNTIME"');
    expect(packageScript).toContain("--stage=payload");
    expect(packageScript).toContain("--stage=archive");
    expect(installScript).toContain(
      "Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts",
    );
  });

  it("installs and removes a packaged CLI without Go or elevated access", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-cli-package-"));
    const packageRoot = join(fixtureRoot, "package");
    const home = join(fixtureRoot, "home");
    const installRoot = join(home, ".local", "share", "ytm-enhancer-cli");
    const binDir = join(home, ".local", "bin");
    const configHome = join(home, ".config");

    try {
      mkdirSync(home, { recursive: true });
      writeCliPackageFixture(packageRoot);

      const environment = {
        ...process.env,
        HOME: home,
        PATH: "/usr/bin:/bin",
        XDG_CONFIG_HOME: configHome,
        YTME_BIN_DIR: binDir,
        YTME_HOST_ARCH: "x86_64",
        YTME_HOST_OS: "Linux",
        YTME_INSTALL_ROOT: installRoot,
      };
      const install = spawnSync("bash", [join(packageRoot, "install.sh")], {
        cwd: packageRoot,
        encoding: "utf-8",
        env: environment,
      });
      expect(install.status, install.stderr).toBe(0);

      const cliLink = join(binDir, "ytme");
      const nativeHost = join(installRoot, "bin", "ytme-native-host");
      const chromeManifest = join(
        configHome,
        "google-chrome",
        "NativeMessagingHosts",
        "com.gormanity.ytm_enhancer.cli.json",
      );
      const braveManifest = join(
        configHome,
        "BraveSoftware",
        "Brave-Browser",
        "NativeMessagingHosts",
        "com.gormanity.ytm_enhancer.cli.json",
      );
      expect(lstatSync(cliLink).isSymbolicLink()).toBe(true);
      expect(realpathSync(cliLink)).toBe(
        realpathSync(join(installRoot, "bin", "ytme")),
      );
      expect(readFileSync(chromeManifest, "utf-8")).toContain(nativeHost);
      expect(readFileSync(braveManifest, "utf-8")).toContain(nativeHost);
      expect(
        readFileSync(join(installRoot, ".ytm-enhancer-cli-managed"), "utf-8"),
      ).toBe("com.gormanity.ytm-enhancer.cli:managed-install:v1\n");
      expect(install.stderr).not.toMatch(/sudo|go: command not found/i);

      const uninstall = spawnSync("bash", [join(installRoot, "uninstall.sh")], {
        encoding: "utf-8",
        env: {
          ...environment,
          YTME_INSTALL_ROOT: join(fixtureRoot, "must-not-be-used"),
        },
      });
      expect(uninstall.status, uninstall.stderr).toBe(0);
      expect(existsSync(cliLink)).toBe(false);
      expect(() => lstatSync(cliLink)).toThrow();
      expect(existsSync(chromeManifest)).toBe(false);
      expect(existsSync(braveManifest)).toBe(false);
      expect(existsSync(installRoot)).toBe(false);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("refuses unsafe CLI package mutations before changing user files", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-cli-safety-"));

    try {
      const packageRoot = join(fixtureRoot, "package");
      const home = join(fixtureRoot, "home");
      const binDir = join(home, ".local", "bin");
      const unmanagedCommand = join(binDir, "ytme");
      const installRoot = join(home, ".local", "share", "ytm-enhancer-cli");
      mkdirSync(binDir, { recursive: true });
      writeFileSync(unmanagedCommand, "keep me\n");
      writeCliPackageFixture(packageRoot);

      const baseEnvironment = {
        ...process.env,
        HOME: home,
        PATH: "/usr/bin:/bin",
        XDG_CONFIG_HOME: join(home, ".config"),
        YTME_BIN_DIR: binDir,
        YTME_HOST_ARCH: "x86_64",
        YTME_HOST_OS: "Linux",
        YTME_INSTALL_ROOT: installRoot,
      };
      const unmanagedInstall = spawnSync(
        "bash",
        [join(packageRoot, "install.sh")],
        {
          cwd: packageRoot,
          encoding: "utf-8",
          env: baseEnvironment,
        },
      );
      expect(unmanagedInstall.status).not.toBe(0);
      expect(readFileSync(unmanagedCommand, "utf-8")).toBe("keep me\n");
      expect(existsSync(installRoot)).toBe(false);

      rmSync(unmanagedCommand);
      writeFileSync(join(packageRoot, "RUNTIME"), "macos-arm64\n");
      const wrongRuntime = spawnSync(
        "bash",
        [join(packageRoot, "install.sh")],
        {
          cwd: packageRoot,
          encoding: "utf-8",
          env: baseEnvironment,
        },
      );
      expect(wrongRuntime.status).not.toBe(0);
      expect(existsSync(installRoot)).toBe(false);

      writeFileSync(join(packageRoot, "RUNTIME"), "linux-x64\n");
      const managedTarget = join(fixtureRoot, "symlink-target");
      mkdirSync(managedTarget);
      mkdirSync(resolve(installRoot, ".."), { recursive: true });
      symlinkSync(managedTarget, installRoot);
      const symlinkedRoot = spawnSync(
        "bash",
        [join(packageRoot, "install.sh")],
        {
          cwd: packageRoot,
          encoding: "utf-8",
          env: baseEnvironment,
        },
      );
      expect(symlinkedRoot.status).not.toBe(0);
      expect(existsSync(join(managedTarget, "bin", "ytme"))).toBe(false);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("refuses to uninstall an unmarked or caller-selected directory", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-cli-uninstall-"));
    const packageRoot = join(fixtureRoot, "package");
    const unmanagedRoot = join(fixtureRoot, "unmanaged");

    try {
      writeCliPackageFixture(packageRoot);
      mkdirSync(unmanagedRoot);
      writeFileSync(join(unmanagedRoot, "keep.txt"), "keep me\n");
      const uninstall = spawnSync("bash", [join(packageRoot, "uninstall.sh")], {
        encoding: "utf-8",
        env: {
          ...process.env,
          HOME: join(fixtureRoot, "home"),
          YTME_INSTALL_ROOT: unmanagedRoot,
        },
      });

      expect(uninstall.status).not.toBe(0);
      expect(readFileSync(join(unmanagedRoot, "keep.txt"), "utf-8")).toBe(
        "keep me\n",
      );
      expect(existsSync(packageRoot)).toBe(true);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
  });

  it("validates the complete signed CLI artifact set before publication", () => {
    const workflow = read(".github/workflows/cli-release.yml");
    const validator = read("scripts/ci/validate-cli-release-artifacts.sh");

    expect(workflow).toContain(
      "pnpm exec vitest run tests/apps/companion-initial-releases.test.ts",
    );
    expect(workflow).toContain("Validate CLI release artifacts");
    expect(workflow).toContain("scripts/ci/validate-cli-release-artifacts.sh");
    expect(workflow).toContain("fail_on_unmatched_files: true");
    expect(workflow).toContain("Individual API Keys");
    expect(validator).toContain("shasum -a 256 -c SHA256SUMS");
    expect(validator).toContain("codesign --verify");
    expect(validator).toContain("Timestamp=");
    expect(validator).toContain("Runtime Version=");
    expect(validator).not.toContain("spctl --assess");
    expect(validator).toContain("install.sh");
    expect(validator).toContain("--version");
    expect(validator).toContain("archive contains an unsafe path");
  });

  it("advertises published CLI packages through product pages", () => {
    const siteGenerator = read("apps/menu-bar/scripts/generate-appcast.mjs");
    const pagesWorkflow = read(".github/workflows/pages.yml");
    const menuWorkflow = read(".github/workflows/menu-bar-release.yml");
    const resolver = read("scripts/ci/resolve-published-cli-release.sh");

    expect(siteGenerator).toContain("YTM_CLI_RELEASE_AVAILABLE");
    expect(siteGenerator).toContain("github-release-assets");
    expect(siteGenerator).toContain("YTM-Enhancer-CLI-");
    expect(siteGenerator).not.toContain(
      "Public CLI packaging is not published",
    );
    expect(siteGenerator).not.toContain("Install From Source");
    expect(pagesWorkflow).toContain('"CLI Release"');
    expect(pagesWorkflow).toContain(
      "scripts/ci/resolve-published-cli-release.sh",
    );
    expect(menuWorkflow).toContain(
      "scripts/ci/resolve-published-cli-release.sh",
    );
    expect(resolver).toContain("cli-v[0-9]");
    expect(resolver).toContain("YTM_CLI_RELEASE_AVAILABLE");
    expect(resolver).toContain(".prerelease == false");
    expect(resolver).toContain("SHA256SUMS");
    expect(siteGenerator).toContain("checksumUrl");
    expect(siteGenerator).toContain("Download SHA256SUMS");
    expect(siteGenerator).toContain("install-native-hosts.sh");
  });

  it("renders all published CLI packages in the release index and install page", async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), "ytme-cli-site-"));
    const previousVersion = process.env.YTM_CLI_VERSION;
    const previousAvailability = process.env.YTM_CLI_RELEASE_AVAILABLE;
    const previousChecksumUrl = process.env.YTM_CLI_CHECKSUM_URL;

    try {
      process.env.YTM_CLI_VERSION = "0.1.0";
      process.env.YTM_CLI_RELEASE_AVAILABLE = "true";
      process.env.YTM_CLI_CHECKSUM_URL =
        "https://github.com/gormanity/ytm-enhancer/releases/download/cli-v0.1.0/SHA256SUMS";
      const moduleUrl = pathToFileURL(
        resolve(process.cwd(), "apps/menu-bar/scripts/generate-appcast.mjs"),
      );
      moduleUrl.searchParams.set("cli-release-test", String(Date.now()));
      const { generateLandingPages } = (await import(moduleUrl.href)) as {
        generateLandingPages: (options: { outputPath: string }) => string;
      };
      generateLandingPages({
        outputPath: join(outputRoot, "site/menu-bar/appcast.xml"),
      });

      const releaseIndex = readJson<{
        products: {
          cli: {
            channels: {
              direct: {
                packages: Record<string, { asset: string; packageUrl: string }>;
              };
            };
            distribution: string;
            latestVersion: string;
            tag: string;
            checksumUrl: string;
          };
        };
      }>(join(outputRoot, "site/releases.json"));
      const cliPage = readFileSync(
        join(outputRoot, "site/cli/index.html"),
        "utf-8",
      );
      const connectedAppsPage = readFileSync(
        join(outputRoot, "site/connected-apps/index.html"),
        "utf-8",
      );

      expect(releaseIndex.products.cli).toMatchObject({
        distribution: "github-release-assets",
        latestVersion: "0.1.0",
        tag: "cli-v0.1.0",
      });
      expect(releaseIndex.products.cli.checksumUrl).toContain(
        "/cli-v0.1.0/SHA256SUMS",
      );
      expect(
        Object.keys(releaseIndex.products.cli.channels.direct.packages),
      ).toEqual(["linuxArm64", "linuxX64", "macosArm64", "macosX64"]);
      expect(cliPage).toContain("YTM-Enhancer-CLI-0.1.0-macos-arm64.zip");
      expect(cliPage).toContain("YTM-Enhancer-CLI-0.1.0-linux-x64.tar.gz");
      expect(cliPage).toContain("Download SHA256SUMS");
      expect(cliPage).toContain("use macos-x64 on Intel");
      expect(cliPage).toContain("use linux-arm64 on Arm");
      expect(cliPage).toContain("sha256sum -c -");
      expect(connectedAppsPage).toContain(">Download for macOS or Linux</a>");
      expect(cliPage).not.toContain(
        "The first signed public packages are being prepared.",
      );
    } finally {
      if (previousVersion === undefined) {
        delete process.env.YTM_CLI_VERSION;
      } else {
        process.env.YTM_CLI_VERSION = previousVersion;
      }
      if (previousAvailability === undefined) {
        delete process.env.YTM_CLI_RELEASE_AVAILABLE;
      } else {
        process.env.YTM_CLI_RELEASE_AVAILABLE = previousAvailability;
      }
      if (previousChecksumUrl === undefined) {
        delete process.env.YTM_CLI_CHECKSUM_URL;
      } else {
        process.env.YTM_CLI_CHECKSUM_URL = previousChecksumUrl;
      }
      rmSync(outputRoot, { force: true, recursive: true });
    }
  });

  it("renders approved Markdown in standalone Sparkle release notes", async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), "ytme-menu-notes-"));
    const previousVersion = process.env.YTM_MENU_BAR_VERSION;
    const previousBuild = process.env.YTM_MENU_BAR_BUILD_NUMBER;

    try {
      process.env.YTM_MENU_BAR_VERSION = "0.2.0";
      process.env.YTM_MENU_BAR_BUILD_NUMBER = "2000";
      const moduleUrl = pathToFileURL(
        resolve(process.cwd(), "apps/menu-bar/scripts/generate-appcast.mjs"),
      );
      moduleUrl.searchParams.set("menu-notes-test", String(Date.now()));
      const { generateAppcast } = (await import(moduleUrl.href)) as {
        generateAppcast: (options: {
          archivePath: string;
          edSignature: string;
          outputPath: string;
        }) => string;
      };
      const archivePath = join(outputRoot, "YTM-Menu-Bar-0.2.0.pkg");
      writeFileSync(archivePath, "test package");
      generateAppcast({
        archivePath,
        edSignature: "test-signature",
        outputPath: join(outputRoot, "site/menu-bar/appcast.xml"),
      });

      const notes = readFileSync(
        join(outputRoot, "site/menu-bar/release-notes/0.2.0.html"),
        "utf-8",
      );
      expect(notes).toContain("<h2>Initial public beta</h2>");
      expect(notes).toContain(
        "<li>Control play, pause, previous, next, seeking, shuffle, and repeat without returning to the browser.</li>",
      );
      expect(notes).toContain(
        '<a href="https://gormanity.github.io/ytm-enhancer/menu-bar/install.html">YTM Menu Bar landing page</a>',
      );
      expect(notes).not.toContain(
        "keeps the menu bar companion app up to date",
      );
      expect(notes).not.toContain("## Initial public beta");
      expect(notes).not.toContain("[YTM Menu Bar landing page](");
    } finally {
      if (previousVersion === undefined) {
        delete process.env.YTM_MENU_BAR_VERSION;
      } else {
        process.env.YTM_MENU_BAR_VERSION = previousVersion;
      }
      if (previousBuild === undefined) {
        delete process.env.YTM_MENU_BAR_BUILD_NUMBER;
      } else {
        process.env.YTM_MENU_BAR_BUILD_NUMBER = previousBuild;
      }
      rmSync(outputRoot, { force: true, recursive: true });
    }
  });

  it("renders release-note links without allowing unsafe HTML or URLs", async () => {
    const moduleUrl = pathToFileURL(
      resolve(process.cwd(), "apps/menu-bar/scripts/generate-appcast.mjs"),
    );
    moduleUrl.searchParams.set("menu-notes-safety-test", String(Date.now()));
    const { renderReleaseNotesMarkdown } = (await import(moduleUrl.href)) as {
      renderReleaseNotesMarkdown: (markdown: string) => string;
    };

    const rendered = renderReleaseNotesMarkdown(
      "Read [the <guide>](https://example.test/help?source=release&view=notes), keep `<script>` literal, and do not link [unsafe](javascript:alert(1)).",
    );

    expect(rendered).toContain(
      '<a href="https://example.test/help?source=release&amp;view=notes">the &lt;guide&gt;</a>',
    );
    expect(rendered).toContain("<code>&lt;script&gt;</code>");
    expect(rendered).toContain("[unsafe](javascript:alert(1))");
    expect(rendered).not.toContain('<a href="javascript:');
    expect(rendered).not.toContain("<script>");
  });

  it("requires an explicit published Tray update pair for destructive QA", () => {
    const releaseE2e = read("scripts/windows-qa/tray-release-e2e.ps1");
    const liveUpdate = read("scripts/windows-qa/tray-live-update-smoke.ps1");
    const releaseWrapper = read(
      "scripts/remote/windows-qa/tray-release-e2e.sh",
    );
    const updateWrapper = read(
      "scripts/remote/windows-qa/tray-live-update-smoke.sh",
    );
    const remoteQa = read("docs/remote-qa.md");

    for (const script of [releaseE2e, liveUpdate]) {
      expect(script).toContain(
        "[Parameter(Mandatory = $true)][string] $BaselineVersion",
      );
      expect(script).toContain(
        "[Parameter(Mandatory = $true)][string] $TargetVersion",
      );
      expect(script).not.toContain('"0.0.2"');
      expect(script).not.toContain('"0.1.0"');
    }
    for (const wrapper of [releaseWrapper, updateWrapper]) {
      expect(wrapper).toContain("YTM_WINDOWS_TRAY_BASELINE_VERSION");
      expect(wrapper).toContain("YTM_WINDOWS_TRAY_TARGET_VERSION");
      expect(wrapper).toContain('validate_version "baseline"');
      expect(wrapper).toContain('validate_version "target"');
      expect(wrapper).not.toContain(":-0.0.2");
      expect(wrapper).not.toContain(":-0.1.0");
    }
    expect(updateWrapper).toContain(
      "Usage: $0 <baseline-version> <target-version>",
    );
    expect(remoteQa).not.toContain("0.1.10 0.1.11");
    expect(remoteQa).toContain("<baseline-version> <target-version>");
  });
});
