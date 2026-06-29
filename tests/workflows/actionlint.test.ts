import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GitHub Actions workflow linting", () => {
  it("runs actionlint in CI and exposes a local script", () => {
    const ciWorkflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/ci.yml"),
      "utf-8",
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };

    expect(ciWorkflow).toContain("workflow-lint:");
    expect(ciWorkflow).toContain('mkdir -p "$HOME/.local/bin"');
    expect(ciWorkflow).toContain("scripts/download-actionlint.bash");
    expect(ciWorkflow).toContain("Lint GitHub Actions workflows");
    expect(ciWorkflow).toContain("pnpm run workflow:check");
    expect(packageJson.scripts["workflow:check"]).toBe("actionlint");
  });

  it("runs hosted browser E2E without paid runners or default artifacts", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/browser-e2e.yml"),
      "utf-8",
    );

    expect(workflow).toContain("Browser E2E");
    expect(workflow).toContain("runs-on: ubuntu-latest");
    expect(workflow).toContain(
      "playwright install --with-deps chromium firefox",
    );
    expect(workflow).toContain("pnpm run build:chrome");
    expect(workflow).toContain("pnpm run dev:build:chrome");
    expect(workflow).toContain("pnpm run dev:build:firefox");
    expect(workflow).toContain("--project=chromium");
    expect(workflow).toContain("--project=firefox");
    expect(workflow).not.toContain("self-hosted");
    expect(workflow).not.toContain("upload-artifact");
  });

  it("runs hosted Windows tray QA without desktop automation", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/windows-qa.yml"),
      "utf-8",
    );

    expect(workflow).toContain("Windows QA");
    expect(workflow).toContain("runs-on: windows-latest");
    expect(workflow).toContain("actions/setup-dotnet@v5");
    expect(workflow).toContain("dotnet-version: 10.0.x");
    expect(workflow).toContain("paths:");
    expect(workflow).toContain("scripts/windows-qa/tray-smoke.ps1");
    expect(workflow).toContain("scripts/windows-qa/tray-package-smoke.ps1");
    expect(workflow).toContain("tests/apps/windows-tray-scaffold.test.ts");
    expect(workflow).toContain("tests/remote-qa-windows.test.ts");
    expect(workflow).not.toContain("self-hosted");
    expect(workflow).not.toContain("upload-artifact");
    expect(workflow).not.toContain("tray-visual-smoke.ps1");
    expect(workflow).not.toContain("tray-button-smoke.ps1");
  });

  it("deploys product pages from main without a component release", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/pages.yml"),
      "utf-8",
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };

    expect(workflow).toContain("Product Pages");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("apps/cli/release/**");
    expect(workflow).toContain("apps/cli/scripts/render-demo-video.mjs");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("Preserve release-owned menu bar feed");
    expect(workflow).toContain(
      "gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml",
    );
    expect(workflow).toContain("YTM_MENU_BAR_VERSION=$version");
    expect(workflow).toContain("pnpm run site:build");
    expect(workflow).toContain(
      "apps/menu-bar/.build/appcast/menu-bar/appcast.xml",
    );
    expect(workflow).toContain("actions/configure-pages@v6");
    expect(workflow).toContain("actions/upload-pages-artifact@v5");
    expect(workflow).toContain("include-hidden-files: true");
    expect(workflow).toContain("actions/deploy-pages@v5");
    expect(workflow).not.toContain("tags:");
    expect(packageJson.scripts["site:build"]).toBe(
      "node apps/menu-bar/scripts/generate-appcast.mjs --site-only",
    );
  });
});
