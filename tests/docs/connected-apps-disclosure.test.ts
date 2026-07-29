import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("Connected Apps release disclosures", () => {
  it("introduces Connected Apps from the user's point of view", () => {
    const readme = read("README.md");

    expect(readme).toContain("## Connected Apps");
    expect(readme).toContain(
      "Control YouTube Music from the macOS menu bar, Windows taskbar, or your terminal.",
    );
    expect(readme).toContain("disabled by default");
    expect(readme).toContain("communicate locally");
  });

  it("documents local connector data use in the privacy policy", () => {
    const privacyPolicy = read("PRIVACY.md");

    expect(privacyPolicy).toContain("Connected Apps");
    expect(privacyPolicy).toContain("`nativeMessaging`");
    expect(privacyPolicy).toContain("playback state and track metadata");
    expect(privacyPolicy).toContain(
      "No project-operated servers are contacted",
    );
  });

  it("describes Connected Apps and native messaging in store copy", () => {
    const storeListing = read("store/STORE.md");

    expect(storeListing).toContain("Connected Apps:");
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
});
