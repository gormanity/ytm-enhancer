import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readManifest(browser: "chrome" | "edge" | "firefox") {
  return JSON.parse(
    readFileSync(
      resolve(process.cwd(), `src/manifests/${browser}.json`),
      "utf-8",
    ),
  ) as { permissions?: string[] };
}

describe("native messaging manifest permissions", () => {
  it.each(["chrome", "edge", "firefox"] as const)(
    "declares native messaging for %s",
    (browser) => {
      expect(readManifest(browser).permissions).toContain("nativeMessaging");
    },
  );
});
