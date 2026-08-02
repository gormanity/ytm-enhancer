import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("Connected Apps release disclosures", () => {
  it("introduces Connected Apps from the user's point of view", () => {
    const readme = read("README.md");

    expect(readme).toContain("## Connected Apps (Beta)");
    expect(readme).toContain(
      "Control YouTube Music from the macOS menu bar, Windows system tray, or your terminal.",
    );
    expect(readme).toContain("disabled by default");
    expect(readme).toContain("communicate locally");
  });

  it("documents local connector data use in the privacy policy", () => {
    const privacyPolicy = read("PRIVACY.md");

    expect(privacyPolicy).toContain("Connected Apps");
    expect(privacyPolicy).toContain("`nativeMessaging`");
    expect(privacyPolicy).toContain("`tabs` (Firefox only)");
    expect(privacyPolicy).toContain("playback state and track metadata");
    expect(privacyPolicy).toContain(
      "No project-operated backend services are contacted",
    );
    expect(read("README.md")).toContain("| `nativeMessaging`");
    expect(read("README.md")).toContain("| `tabs` (Firefox only)");
  });

  it("describes Connected Apps and native messaging in store copy", () => {
    const storeListing = read("store/STORE.md");

    expect(storeListing).toContain("### Connected Apps (Beta)");
    expect(storeListing).toContain("separately installed");
    expect(storeListing).toContain(
      "The Connected Apps (Beta) feature is opt-in and disabled by default",
    );
    expect(storeListing).toContain("##### `nativeMessaging`");
    expect(storeListing).toContain("enabled companion apps on your device");
    expect(storeListing).toContain("#### `tabs` Permission");
    expect(storeListing).toMatch(
      /find existing YouTube Music\s+tabs, select the playback source, and open or focus YouTube Music/,
    );
    expect(storeListing).toMatch(
      /does not use this permission to read unrelated\s+browsing history/,
    );
  });

  it("does not advertise completed connector release work as pending", () => {
    const connectorDocs = read("docs/connectors.md");

    expect(connectorDocs).not.toContain(
      "Remaining work before a public connector release",
    );
    expect(connectorDocs).toContain("Release Status");
    expect(connectorDocs).toContain(
      "Automated connector smoke covers buttons in Chromium, Edge, and Firefox.",
    );
    expect(connectorDocs).toContain(
      "Automated connector smoke covers Chromium and Firefox.",
    );
    expect(connectorDocs).toContain("connector smoke covers Edge and Firefox.");
  });

  it("keeps public marketing copy benefit-led and terminology consistent", () => {
    const readme = read("README.md");
    const storeListing = read("store/STORE.md");
    const storeScreenshot = read("store/screenshots/05-connected-apps.html");
    const siteGenerator = read("apps/menu-bar/scripts/generate-appcast.mjs");
    const trayNotes = read("apps/windows-tray/release/notes/0.2.0.md");

    expect(readme).toContain(
      "The YouTube Music controls you’ve been missing.",
    );
    expect(readme.replace(/\s+/g, " ")).toContain(
      "Add precise playback controls, useful automation, a compact mini player, and more—without replacing the YouTube Music experience you already use.",
    );
    expect(readme).not.toContain(
      "Make YouTube Music work the way you listen.",
    );
    expect(readme).not.toMatch(/supercharges|best browser-based|ubiquity/i);
    expect(readme).toContain("**Connected Apps (Beta)**");
    expect(readme).toContain("Windows system tray");
    expect(readme).not.toContain("Windows taskbar");
    expect(readme).toContain("Supports Chrome, Edge, and Firefox");
    expect(readme).not.toContain("Supports all major browsers");
    expect(readme).toContain(
      "Control playback, focus YouTube Music, or trigger module actions without opening the popup.",
    );
    expect(readme).not.toContain("trigger module actions from any app");
    expect(storeListing.replace(/\s+/g, " ")).toContain("Windows system tray");
    expect(storeScreenshot).toContain("Windows system tray");
    expect(storeScreenshot).not.toContain("Windows taskbar");
    expect(trayNotes.replace(/\s+/g, " ")).toContain("Windows system tray");
    expect(trayNotes).not.toContain("Windows taskbar");

    expect(siteGenerator).toContain(
      '<p class="eyebrow">Connected Apps Beta for macOS</p>',
    );
    expect(siteGenerator).toContain(
      "The YouTube Music controls you’ve been missing.",
    );
    expect(siteGenerator).toContain(
      "Add precise playback controls, useful automation, a compact mini player,",
    );
    expect(siteGenerator).not.toContain(
      "Make YouTube Music work the way you listen",
    );
    expect(siteGenerator).toContain(
      '<p class="eyebrow">Connected Apps Beta for macOS and Linux</p>',
    );
    expect(siteGenerator).not.toContain("native Connected Apps");
    expect(siteGenerator).not.toContain("beta native app bridge");
    expect(siteGenerator).not.toContain("first-party native companions");
    expect(siteGenerator).not.toContain("First-Party Apps");
    expect(siteGenerator).not.toContain("Connected Apps API");
    expect(siteGenerator).not.toContain("connector API");
  });

  it("records one shared short description for store submissions", () => {
    const description =
      "Upgrade YouTube Music with smarter controls, automation, a mini player, and optional Connected Apps (Beta).";
    const storeListing = read("store/STORE.md");
    const manifests = [
      "src/manifests/chrome.json",
      "src/manifests/edge.json",
      "src/manifests/firefox.json",
    ].map((path) => JSON.parse(read(path)) as { description: string });

    expect(storeListing).toContain("### Short Description");
    expect(storeListing.replace(/\s+/g, " ")).toContain(description);
    for (const manifest of manifests) {
      expect(manifest.description).toBe(description);
    }
  });

  it("keeps public permission explanations aligned with browser manifests", () => {
    const readme = read("README.md");
    const privacyPolicy = read("PRIVACY.md");

    for (const document of [readme, privacyPolicy]) {
      expect(document).toContain("`nativeMessaging`");
      expect(document).toContain("`tabs`");
      expect(document).toContain("Firefox");
      expect(document).toMatch(/unrelated\s+browsing history/);
      expect(document).toContain("project-operated backend services");
      expect(document).not.toContain("no external backend services");
    }
  });

  it("discloses companion app update checks without overstating data use", () => {
    const privacyPolicy = read("PRIVACY.md");
    const normalizedPolicy = privacyPolicy.replace(/\s+/g, " ");

    expect(normalizedPolicy).toContain(
      "YTM Menu Bar and YTM Tray contact GitHub-hosted release endpoints",
    );
    expect(normalizedPolicy).toMatch(
      /do not include playback state, track metadata, account data, or credentials/,
    );
    expect(privacyPolicy).toContain(
      "No project-operated backend services are contacted.",
    );
  });

  it("states beta status and directs initial app notes to product pages", () => {
    const releaseNotes = [
      {
        notes: read("apps/menu-bar/release/notes/0.2.0.md"),
        landingPage:
          "https://gormanity.github.io/ytm-enhancer/menu-bar/install.html",
      },
      {
        notes: read("apps/windows-tray/release/notes/0.2.0.md"),
        landingPage:
          "https://gormanity.github.io/ytm-enhancer/windows-tray/install.html",
      },
      {
        notes: read("apps/cli/release/notes/0.1.0.md"),
        landingPage: "https://gormanity.github.io/ytm-enhancer/cli/",
      },
    ];

    for (const { notes, landingPage } of releaseNotes) {
      expect(notes).toContain("Connected Apps (Beta)");
      expect(notes).toContain(landingPage);
      expect(notes).not.toContain("### Get started");
    }
  });
});
