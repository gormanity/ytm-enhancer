import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const copyScript = resolve(process.cwd(), "scripts/store-copy.mjs");

function renderCopy(section: "short" | "detailed" | "firefox"): string {
  return execFileSync(process.execPath, [copyScript, section], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

describe("paste-ready store copy", () => {
  it("renders the shared short description as one plain-text line", () => {
    const description = renderCopy("short");

    expect(description).toBe(
      "Upgrade YouTube Music with smarter controls, automation, a mini player, and optional Connected Apps (Beta).\n",
    );
    expect(description.trim().length).toBeLessThanOrEqual(132);
  });

  it("renders one browser-neutral detailed description as plain text", () => {
    const description = renderCopy("detailed");

    expect(description.length).toBeGreaterThanOrEqual(250);
    expect(description.length).toBeLessThanOrEqual(10_000);
    expect(description).toContain(
      "Make YouTube Music work the way you listen.",
    );
    expect(description).toContain("Connected Apps (Beta)");
    expect(description).toContain("Private by Design");
    expect(description).toContain("• Playback Controls:");
    expect(description).not.toMatch(/https?:\/\//);
    expect(description).not.toMatch(/\b(?:Chrome|Chromium|Edge|Firefox)\b/);
    expect(description).not.toMatch(/(^|\n)#{1,6}\s/);
    expect(description).not.toMatch(/(^|\n)-\s|[*_`]/);
    expect(description).not.toContain("Positioning");
    expect(description).not.toContain("Repository:");
  });

  it("renders the AMO description with only modest supported Markdown", () => {
    const description = renderCopy("firefox");

    expect(description.length).toBeGreaterThanOrEqual(250);
    expect(description).toContain("**Key Features**");
    expect(description).toContain("- **Playback Controls:** Play, pause");
    expect(description).toContain("**Connected Apps (Beta)**");
    expect(description).toContain("**Private by Design**");
    expect(description).not.toContain("• ");
    expect(description).not.toMatch(/https?:\/\//);
    expect(description).not.toMatch(/\b(?:Chrome|Chromium|Edge)\b/);
    expect(description).not.toMatch(/(^|\n)#{1,6}\s/);
    expect(description).not.toMatch(/<\/?[a-z][^>]*>/i);
    expect(description).not.toMatch(/\[[^\]]+]\([^)]+\)/);
  });
});
