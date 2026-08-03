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

    expect(storeCopy).toContain(
      "The YouTube Music controls you’ve been missing.",
    );
    expect(storeCopy.replace(/\s+/g, " ")).toContain(
      "Add precise playback controls, useful automation, a compact mini player, and more—without replacing the YouTube Music experience you already use.",
    );
    expect(storeCopy).not.toContain(
      "Make YouTube Music work the way you listen.",
    );
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
    const playback = read("store/screenshots/01-playback-controls.html");
    const document = new DOMParser().parseFromString(playback, "text/html");
    const navigation = Array.from(document.querySelectorAll(".nav-item")).map(
      normalizedText,
    );

    expect(navigation).toEqual(CURRENT_NAVIGATION);
    expect(playback).toContain("height: 480px;");
    expect(playback).not.toContain("height: 540px;");
    expect(playback).toContain("Control YouTube Music from one place");
    expect(playback).toContain("Settings");
    expect(playback).toContain("Show selected tab favicon indicator");
    expect(playback).not.toContain("<h3>Volume</h3>");
    expect(playback).not.toContain("<h3>Audio &amp; Playback</h3>");
  });

  it("shows a coherent current visualizer state", () => {
    const visualizer = read("store/screenshots/03-visualizer.html");

    expect(visualizer).toContain("See your music move");
    expect(visualizer).toContain("<option selected>All Surfaces</option>");
    expect(visualizer).toContain("<option selected>Artwork Adaptive</option>");
    expect(visualizer).not.toContain("<option selected>Auto</option>");
    expect(visualizer).not.toContain("<option selected>White</option>");
    expect(visualizer).toContain('const barColor = "#ff776d";');
    expect(visualizer).not.toContain("colors.push(`hsl(");
    expect(visualizer).not.toContain("const hue =");
  });

  it("shows the current three-state Auto-Play control", () => {
    const automation = read("store/screenshots/04-sleep-timer.html");

    expect(automation).toContain("<h2>Automation</h2>");
    expect(automation).toContain('class="auto-play-select"');
    expect(automation).toContain("<option>Default</option>");
    expect(automation).toContain("<option>Off</option>");
    expect(automation).toContain("<option selected>On</option>");
    expect(automation).toContain(
      "Start playback automatically when YouTube Music loads with music ready to play.",
    );
    expect(automation).toContain("Preview Notification");
    expect(automation).not.toContain("<h2>Smart Playback</h2>");
  });

  it("presents all three Connected Apps with benefit-led copy", () => {
    const connectedAppsPath = "store/screenshots/05-connected-apps.html";
    const connectedApps = read(connectedAppsPath);

    expect(existsSync(resolve(process.cwd(), connectedAppsPath))).toBe(true);
    expect(connectedApps).toContain("Keep YouTube Music controls within reach");
    expect(connectedApps).toContain("Optional Connected Apps (Beta)");
    expect(connectedApps).toContain(
      "Install only the controls you want for macOS, Windows, or your terminal.",
    );
    expect(connectedApps).toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr));",
    );
    expect(connectedApps).toContain(
      "Control playback from the macOS menu bar.",
    );
    expect(connectedApps).toContain(
      "Control playback from the Windows system tray.",
    );
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

  it("features the extension itself in the marquee", () => {
    const marquee = read("store/screenshots/promo-marquee-1400x560.html");

    expect(marquee).toContain(
      "The YouTube Music controls you’ve been missing.",
    );
    expect(marquee).toContain("01-playback-controls.png");
    expect(marquee).toContain("02-mini-player.png");
    expect(marquee).toContain("Playback Controls");
    expect(marquee).toContain("Mini Player");
    expect(marquee).toContain("Automation");
    expect(marquee).not.toContain("menu-bar-screenshot.png");
    expect(marquee).not.toContain("windows-tray-screenshot.png");
    expect(marquee).not.toContain("cli-demo-poster.png");
    expect(marquee).not.toContain("rotate(");
    expect(marquee).not.toMatch(/>\s*Auto Play\s*</);
    expect(marquee).not.toMatch(/>\s*Auto Skip\s*</);
  });

  it("uses direct, benefit-led copy in supporting promotional assets", () => {
    const smallPromo = read("store/screenshots/promo-small-440x280.html");
    const automation = read("store/screenshots/04-sleep-timer.html");
    const miniPlayer = read("store/screenshots/02-mini-player.html");

    expect(smallPromo).toContain(
      "The YouTube Music controls you’ve been missing.",
    );
    expect(smallPromo).not.toContain("YouTube Music, your way.");
    expect(smallPromo).not.toMatch(/supercharge/i);
    expect(automation).toContain("Make playback follow your routine");
    expect(automation.replace(/\s+/g, " ")).toContain(
      "Automate starts and skips, schedule a stop, and choose your notifications.",
    );
    expect(automation).not.toContain("Set It and Forget It");
    expect(miniPlayer).toContain(
      "Keep playback controls visible while you work.",
    );
    expect(miniPlayer).toContain("On supported browsers");
    expect(miniPlayer).toContain("width: 620px;");
    expect(miniPlayer).toContain("height: 245px;");
    expect(smallPromo).not.toContain('class="feature-strip"');
  });

  it("uses locally bundled public-domain album artwork in the Mini Player", () => {
    const miniPlayer = read("store/screenshots/02-mini-player.html");
    const notices = read("docs/third-party-notices.md");
    const coverPath = resolve(
      process.cwd(),
      "store/screenshots/assets/mini-player-cover.png",
    );

    expect(existsSync(coverPath)).toBe(true);
    expect(miniPlayer).toContain('src="./assets/mini-player-cover.png"');
    expect(miniPlayer).toContain('class="pip-artwork"');
    expect(miniPlayer).toContain("object-fit: cover;");
    expect(miniPlayer).toContain("The Fourth Colour");
    expect(miniPlayer).toContain("King Gizzard &amp; The Lizard Wizard");
    expect(miniPlayer).toContain("Polygondwanaland &middot; 2017");
    expect(miniPlayer).not.toContain("Lowdown");
    expect(miniPlayer).not.toContain("Boz Scaggs");
    expect(notices).toContain("Polygondwanaland");
    expect(notices).toContain("public domain");
    expect(notices).toContain(
      "https://commons.wikimedia.org/wiki/File:Polygondwanaland.jpg",
    );
  });

  it("documents browser-appropriate screenshot order", () => {
    const storeReadme = read("store/README.md");

    expect(storeReadme).toContain("### Chrome and Edge screenshot order");
    expect(storeReadme).toMatch(
      /01-playback-controls\.png[\s\S]*02-mini-player\.png[\s\S]*04-sleep-timer\.png[\s\S]*03-visualizer\.png[\s\S]*05-connected-apps\.png/,
    );
    expect(storeReadme).toContain("### Firefox screenshot order");
    expect(storeReadme).toContain(
      "Omit `02-mini-player.png` from Firefox Add-ons",
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
