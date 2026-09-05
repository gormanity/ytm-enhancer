import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Homebrew cask generation", () => {
  it.each([undefined, "https://example.com/local-update.pkg"])(
    "preserves checksum verification and URL behavior for %s",
    (customUrl) => {
      const root = mkdtempSync(join(tmpdir(), "ytm-homebrew-cask-"));
      try {
        const packagePath = join(root, "fixture.pkg");
        const outputPath = join(root, "ytm-menu-bar.rb");
        const payload = "Homebrew package fixture";
        writeFileSync(packagePath, payload);
        const result = spawnSync(
          process.execPath,
          [
            resolve("apps/menu-bar/scripts/generate-homebrew-cask.mjs"),
            `--package=${packagePath}`,
            `--output=${outputPath}`,
            ...(customUrl ? [`--url=${customUrl}`] : []),
          ],
          {
            encoding: "utf-8",
            env: {
              ...process.env,
              YTM_MENU_BAR_VERSION: "1.2.3",
              YTM_MENU_BAR_LOCAL_BUILD: "0",
              YTM_MENU_BAR_HOMEBREW_URL: "",
            },
          },
        );
        expect(result.status, result.stderr).toBe(0);
        const cask = readFileSync(outputPath, "utf-8");
        expect(cask).toContain('version "1.2.3"');
        expect(cask).toContain(
          `sha256 "${createHash("sha256").update(payload).digest("hex")}"`,
        );
        expect(cask).toContain(
          `url "${customUrl ?? "https://github.com/gormanity/ytm-enhancer/releases/download/menu-bar-v#{version}/YTM-Menu-Bar-Homebrew-#{version}.pkg"}"`,
        );
        expect(cask).not.toContain("sha256 :no_check");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
