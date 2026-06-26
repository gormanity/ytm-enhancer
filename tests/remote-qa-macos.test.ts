import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("macOS remote QA scaffold", () => {
  it("documents the bowfin macOS smoke path and scripts", () => {
    const docs = read("docs/remote-qa.md");

    expect(docs).toContain("bowfin");
    expect(docs).toContain("scripts/macos-qa/menu-bar-button-smoke.sh");
    expect(docs).toContain("scripts/remote/macos-qa/menu-bar-package-smoke.sh");
    expect(docs).toContain("scripts/remote/macos-qa/menu-bar-button-smoke.sh");
    expect(docs).toContain("active macOS desktop session");
    expect(docs).toContain("YTME_MENU_BAR_E2E_PROJECT");
    expect(docs).toContain("YTME_MENU_BAR_REQUIRE_BUTTONS");
    expect(docs).toContain("REMOTE_QA_MENU_BAR_E2E_PROJECT");
    expect(docs).toContain("REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS");
    expect(docs).toContain(
      "Peekaboo can be useful for manual visual inspection",
    );
    expect(docs).toMatch(
      /Firefox\s+connector behavior should be treated as manual QA/,
    );
    expect(docs).toMatch(/Firefox CLI connector\s+coverage as manual QA/);
  });

  it("automates macOS menu bar release package smoke", () => {
    const packageSmoke = read(
      "scripts/remote/macos-qa/menu-bar-package-smoke.sh",
    );

    expect(packageSmoke).toContain("SPARKLE_PUBLIC_ED_KEY");
    expect(packageSmoke).toContain("menu-bar:package:direct");
    expect(packageSmoke).toContain("pkgutil");
    expect(packageSmoke).toContain("YTM-Menu-Bar-.+\\.pkg");
    expect(packageSmoke).toContain("YTM Menu Bar Uninstaller.command");
    expect(packageSmoke).toContain("com.gormanity.ytm_enhancer.menu_bar.json");
  });

  it("automates macOS menu bar button smoke against a browser fixture", () => {
    const localButtonSmoke = read("scripts/macos-qa/menu-bar-button-smoke.sh");
    const buttonSmoke = read(
      "scripts/remote/macos-qa/menu-bar-button-smoke.sh",
    );
    const menuBarE2e = read("tests/e2e/menu-bar-connector.spec.ts");

    expect(localButtonSmoke).toContain("YTME_E2E_MENU_BAR=1");
    expect(localButtonSmoke).toContain("YTME_E2E_REQUIRE_MENU_BAR_AUTOMATION");
    expect(localButtonSmoke).toContain("YTME_MENU_BAR_E2E_PROJECT");
    expect(localButtonSmoke).toContain("YTME_MENU_BAR_REQUIRE_BUTTONS");
    expect(localButtonSmoke).toContain("REMOTE_QA_MENU_BAR_E2E_PROJECT");
    expect(localButtonSmoke).toContain("REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS");
    expect(localButtonSmoke).toContain("pnpm install --frozen-lockfile");
    expect(localButtonSmoke).toContain("playwright install chromium");
    expect(localButtonSmoke).toContain('pnpm run "$build_command"');
    expect(localButtonSmoke).toContain(
      'playwright test tests/e2e/menu-bar-connector.spec.ts --project="$project"',
    );
    expect(menuBarE2e).toContain("player-loaded-long-metadata");
    expect(menuBarE2e).toContain("YTM_MENU_BAR_SCROLL_QA");
    expect(menuBarE2e).toContain("metadata scroll advanced");
    expect(buttonSmoke).toContain("scripts/macos-qa/menu-bar-button-smoke.sh");
    expect(buttonSmoke).toContain("YTME_MENU_BAR_E2E_PROJECT=$project");
    expect(buttonSmoke).toContain(
      "YTME_MENU_BAR_REQUIRE_BUTTONS=$require_buttons",
    );
    expect(buttonSmoke).toContain("REMOTE_QA_MENU_BAR_E2E_PROJECT");
    expect(buttonSmoke).toContain("REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS");
    expect(menuBarE2e).toContain("FIRST_PARTY_MENU_BAR_CONNECTOR_ID");
    expect(menuBarE2e).toContain("YTM_ENHANCER_EXTRA_CHROMIUM_MANIFEST_DIRS");
    expect(menuBarE2e).toContain("extensionUserDataDir");
    expect(menuBarE2e).toContain("YTM_MENU_BAR_LOG_PATH");
    expect(menuBarE2e).toContain("menuBarAutomationRequired");
    expect(menuBarE2e).toContain("Chromium-family browsers");
    expect(menuBarE2e).toContain("UI elements enabled");
    expect(menuBarE2e).toContain("System Events");
    expect(menuBarE2e).toContain("Focus YouTube Music");
    expect(menuBarE2e).toContain("Quit");
  });
});
