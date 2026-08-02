import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const CURRENT_NAVIGATION = [
  "Playback Controls",
  "Automation",
  "Audio Visualizer",
  "Hotkeys",
  "Mini Player",
  "Notifications",
  "Sleep Timer",
  "Connected Apps",
  "About",
];

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

function normalizedText(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("store assets", () => {
  it("leads with concrete benefits and labels Connected Apps as beta", () => {
    const storeCopy = read("store/STORE.md");
    const expectedDescription =
      "Upgrade YouTube Music with smarter controls, automation, a mini player, and optional Connected Apps (Beta).";
    const manifestDescriptions = [
      "src/manifests/chrome.json",
      "src/manifests/edge.json",
      "src/manifests/firefox.json",
    ].map((path) => {
      const manifest = JSON.parse(read(path)) as { description: string };
      return manifest.description;
    });

    expect(storeCopy).toContain("Make YouTube Music work the way you listen.");
    expect(storeCopy).toContain("### Short Description");
    expect(storeCopy.replace(/\s+/g, " ")).toContain(expectedDescription);
    expect(storeCopy).toContain("### Connected Apps (Beta)");
    expect(storeCopy).toContain("separately installed");
    expect(storeCopy).toContain("### Private by Design");
    expect(storeCopy.replace(/\s+/g, " ")).toContain(
      "does not send your listening data to project-operated servers",
    );
    expect(storeCopy).not.toContain("Open Source and Privacy Positioning");
    expect(storeCopy).not.toContain("Repository:");
    expect(storeCopy).not.toContain("supercharges YouTube Music");
    expect(storeCopy).not.toContain("best browser-based media player");
    expect(storeCopy).toMatch(
      /### Homepage URL\s+`https:\/\/gormanity\.github\.io\/ytm-enhancer\/`/,
    );
    expect(manifestDescriptions).toEqual([
      expectedDescription,
      expectedDescription,
      expectedDescription,
    ]);
    for (const description of manifestDescriptions) {
      expect(description.length).toBeLessThanOrEqual(132);
      expect(description).not.toMatch(/https?:\/\/|[*_`#]/);
    }
  });

  it("shows the current popup navigation in the playback screenshot", () => {
    const document = new DOMParser().parseFromString(
      read("store/screenshots/01-playback-controls.html"),
      "text/html",
    );
    const navigation = Array.from(document.querySelectorAll(".nav-item")).map(
      normalizedText,
    );

    expect(navigation).toEqual(CURRENT_NAVIGATION);
  });

  it("presents all three Connected Apps with benefit-led copy", () => {
    const connectedAppsPath = "store/screenshots/05-connected-apps.html";
    const connectedApps = read(connectedAppsPath);

    expect(existsSync(resolve(process.cwd(), connectedAppsPath))).toBe(true);
    expect(connectedApps).toContain("Keep YouTube Music controls within reach");
    expect(connectedApps).toContain(
      "Use the macOS menu bar, Windows system tray, or terminal.",
    );
    expect(connectedApps).toContain("Optional Connected Apps (Beta)");
    expect(connectedApps).toContain("YTM Menu Bar");
    expect(connectedApps).toContain("YTM Tray");
    expect(connectedApps).toContain("YTM Enhancer CLI");
    expect(
      existsSync(
        resolve(
          process.cwd(),
          "store/screenshots/05-hotkeys-notifications.html",
        ),
      ),
    ).toBe(false);
  });

  it("features Connected Apps in the marquee without obsolete navigation", () => {
    const marquee = read("store/screenshots/promo-marquee-1400x560.html");

    expect(marquee).toContain("Connected Apps (Beta)");
    expect(marquee).toContain("Make YouTube Music work the way you listen.");
    expect(marquee).toContain("macOS");
    expect(marquee).toContain("Windows");
    expect(marquee).toContain("Terminal");
    expect(marquee).not.toMatch(/>\s*Auto Play\s*</);
    expect(marquee).not.toMatch(/>\s*Auto Skip\s*</);
  });

  it("uses direct, benefit-led copy in supporting promotional assets", () => {
    const smallPromo = read("store/screenshots/promo-small-440x280.html");
    const automation = read("store/screenshots/04-sleep-timer.html");
    const miniPlayer = read("store/screenshots/02-mini-player.html");

    expect(smallPromo).toContain("YouTube Music, your way.");
    expect(smallPromo).not.toMatch(/supercharge/i);
    expect(automation).toContain("Make playback follow your routine");
    expect(automation.replace(/\s+/g, " ")).toContain(
      "Automate starts and skips, schedule a stop, and choose your notifications.",
    );
    expect(automation).not.toContain("Set It and Forget It");
    expect(miniPlayer).toContain(
      "Keep playback controls visible while you work.",
    );
  });

  it("rebuilds both submission and tracked assets from a clean output", () => {
    const buildScript = read("scripts/build-store.mjs");

    expect(buildScript).toContain('"05-connected-apps"');
    expect(buildScript).not.toContain('"05-hotkeys-notifications"');
    expect(buildScript).toContain("await rm(outputDir");
    expect(buildScript).toContain("resolve(sourceDir, `${assetName}.png`)");
    expect(buildScript).toContain('"short-description.txt"');
    expect(buildScript).toContain('"description.txt"');
    expect(buildScript).toContain('"firefox-description.md"');
    expect(buildScript).toContain('animations: "disabled"');
    expect(buildScript).toContain("Math.random =");
  });

  it("documents the Chrome nativeMessaging privacy submission step", () => {
    const storeReadme = read("store/README.md");
    const storeCopy = read("store/STORE.md");

    expect(storeReadme).toContain("Privacy practices");
    expect(storeReadme).toContain("nativeMessaging");
    expect(storeCopy).toContain(
      "verify Chrome Privacy practices permission justifications",
    );
  });
});
