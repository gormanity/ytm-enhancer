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

describe("initial public companion releases", () => {
  it("establishes monotonic public-beta versions with standalone notes", () => {
    const menuMetadata = readJson<{ buildNumber: string; version: string }>(
      "apps/menu-bar/release/metadata.json",
    );
    const trayMetadata = readJson<{ buildNumber: string; version: string }>(
      "apps/windows-tray/release/metadata.json",
    );
    const menuNotes = read("apps/menu-bar/release/notes/0.2.0.md");
    const trayNotes = read("apps/windows-tray/release/notes/0.2.0.md");
    const cliNotes = read("apps/cli/release/notes/0.1.0.md");

    expect(menuMetadata).toMatchObject({
      buildNumber: "2000",
      version: "0.2.0",
    });
    expect(trayMetadata).toMatchObject({
      buildNumber: "2000",
      version: "0.2.0",
    });
    expect(
      read("apps/menu-bar/Sources/YTMMenuBarConnector/AppMetadata.swift"),
    ).toContain('baseVersion = "0.2.0"');
    expect(
      read("apps/windows-tray/src/YTMTray.Core/YTMTray.Core.csproj"),
    ).toContain("<Version>0.2.0</Version>");
    expect(read("apps/cli/internal/protocol/protocol.go")).toContain(
      'ConnectorVersion = "0.1.0"',
    );

    for (const notes of [menuNotes, trayNotes, cliNotes]) {
      expect(notes).toContain("Initial public beta");
      expect(notes).not.toContain("What's Changed");
      expect(notes).not.toContain("Full Changelog");
      expect(notes).not.toMatch(/compare\/|previous release/i);
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
    expect(cliWorkflow).not.toContain("generate_release_notes: true");
    expect(cliWorkflow).not.toContain("previous_tag:");
  });

  it("packages prebuilt CLI binaries for macOS and Linux", () => {
    const packageJson = readJson<{ scripts: Record<string, string> }>(
      "package.json",
    );
    const packageScript = read("apps/cli/scripts/package-release.mjs");
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
    expect(packageScript).toContain("--stage=payload");
    expect(packageScript).toContain("--stage=archive");
  });

  it("installs and removes a packaged CLI without Go or elevated access", () => {
    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-cli-package-"));
    const packageRoot = join(fixtureRoot, "package");
    const home = join(fixtureRoot, "home");
    const installRoot = join(home, ".local", "share", "ytm-enhancer-cli");
    const binDir = join(home, ".local", "bin");
    const configHome = join(home, ".config");

    try {
      mkdirSync(packageRoot, { recursive: true });
      mkdirSync(home, { recursive: true });
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

      const environment = {
        ...process.env,
        HOME: home,
        PATH: "/usr/bin:/bin",
        XDG_CONFIG_HOME: configHome,
        YTME_BIN_DIR: binDir,
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
      expect(lstatSync(cliLink).isSymbolicLink()).toBe(true);
      expect(realpathSync(cliLink)).toBe(
        realpathSync(join(installRoot, "bin", "ytme")),
      );
      expect(readFileSync(chromeManifest, "utf-8")).toContain(nativeHost);
      expect(install.stderr).not.toMatch(/sudo|go: command not found/i);

      const uninstall = spawnSync("bash", [join(installRoot, "uninstall.sh")], {
        encoding: "utf-8",
        env: environment,
      });
      expect(uninstall.status, uninstall.stderr).toBe(0);
      expect(existsSync(cliLink)).toBe(false);
      expect(existsSync(chromeManifest)).toBe(false);
      expect(existsSync(installRoot)).toBe(false);
    } finally {
      rmSync(fixtureRoot, { force: true, recursive: true });
    }
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
  });

  it("renders all published CLI packages in the release index and install page", async () => {
    const outputRoot = mkdtempSync(join(tmpdir(), "ytme-cli-site-"));
    const previousVersion = process.env.YTM_CLI_VERSION;
    const previousAvailability = process.env.YTM_CLI_RELEASE_AVAILABLE;

    try {
      process.env.YTM_CLI_VERSION = "0.1.0";
      process.env.YTM_CLI_RELEASE_AVAILABLE = "true";
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
          };
        };
      }>(join(outputRoot, "site/releases.json"));
      const cliPage = readFileSync(
        join(outputRoot, "site/cli/index.html"),
        "utf-8",
      );

      expect(releaseIndex.products.cli).toMatchObject({
        distribution: "github-release-assets",
        latestVersion: "0.1.0",
        tag: "cli-v0.1.0",
      });
      expect(
        Object.keys(releaseIndex.products.cli.channels.direct.packages),
      ).toEqual(["linuxArm64", "linuxX64", "macosArm64", "macosX64"]);
      expect(cliPage).toContain("YTM-Enhancer-CLI-0.1.0-macos-arm64.zip");
      expect(cliPage).toContain("YTM-Enhancer-CLI-0.1.0-linux-x64.tar.gz");
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
      rmSync(outputRoot, { force: true, recursive: true });
    }
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
      expect(wrapper).not.toContain(":-0.0.2");
      expect(wrapper).not.toContain(":-0.1.0");
    }
    expect(remoteQa).not.toContain("0.1.10 0.1.11");
    expect(remoteQa).toContain("<baseline-version> <target-version>");
  });
});
