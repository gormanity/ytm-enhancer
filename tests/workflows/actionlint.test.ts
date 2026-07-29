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
    const miseConfig = readFileSync(
      resolve(process.cwd(), ".mise.toml"),
      "utf-8",
    );
    const actionlintVersionMatch = miseConfig.match(
      /^actionlint = "([^"]+)"$/m,
    );
    const actionlintVersion = actionlintVersionMatch?.[1] ?? "";
    const jjVersionMatch = miseConfig.match(/^jj = "([^"]+)"$/m);
    const jjVersion = jjVersionMatch?.[1] ?? "";
    const checkJob = ciWorkflow.slice(ciWorkflow.indexOf("  check:"));

    expect(ciWorkflow).toContain("workflow-lint:");
    expect(ciWorkflow).toContain('mkdir -p "$HOME/.local/bin"');
    expect(ciWorkflow).toContain("scripts/download-actionlint.bash");
    expect(actionlintVersion).toBe("1.7.12");
    expect(ciWorkflow).toContain(`ACTIONLINT_VERSION: ${actionlintVersion}`);
    expect(ciWorkflow).toContain('"$ACTIONLINT_VERSION" "$HOME/.local/bin"');
    expect(ciWorkflow).toContain("Lint GitHub Actions workflows");
    expect(ciWorkflow).toContain("pnpm run workflow:check");
    expect(packageJson.scripts["workflow:check"]).toBe("actionlint");
    expect(jjVersion).toBe("0.43.0");
    expect(checkJob).toContain("jdx/mise-action@v4");
    expect(checkJob).toContain("install_args: jj");
    expect(checkJob).toContain("name: Initialize Jujutsu workspace");
    expect(checkJob).toContain("run: jj git init --colocate");
    expect(checkJob.indexOf("jdx/mise-action@v4")).toBeLessThan(
      checkJob.indexOf("Initialize Jujutsu workspace"),
    );
    expect(checkJob.indexOf("Initialize Jujutsu workspace")).toBeLessThan(
      checkJob.indexOf("pnpm run test"),
    );
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

  it("prepares Jujutsu before running extension release checks", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/release.yml"),
      "utf-8",
    );

    expect(workflow).toContain("jdx/mise-action@v4");
    expect(workflow).toContain("install_args: jj");
    expect(workflow).toContain("name: Initialize Jujutsu workspace");
    expect(workflow).toContain("run: jj git init --colocate");
    expect(workflow.indexOf("jdx/mise-action@v4")).toBeLessThan(
      workflow.indexOf("Initialize Jujutsu workspace"),
    );
    expect(workflow.indexOf("Initialize Jujutsu workspace")).toBeLessThan(
      workflow.indexOf("name: Run checks"),
    );
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

  it("deploys product pages without advertising an unpublished tray release", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/pages.yml"),
      "utf-8",
    );
    const menuBarWorkflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/menu-bar-release.yml"),
      "utf-8",
    );
    const resolver = readFileSync(
      resolve(
        process.cwd(),
        "scripts/ci/resolve-published-windows-tray-release.sh",
      ),
      "utf-8",
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts: Record<string, string> };

    expect(workflow).toContain("Product Pages");
    expect(workflow).toContain("branches: [main]");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain(
      'workflows: ["Windows Tray Release", "CLI Release"]',
    );
    expect(workflow).toContain("github.event.workflow_run.conclusion");
    expect(workflow).toContain("apps/cli/release/**");
    expect(workflow).toContain("apps/cli/scripts/render-demo-video.mjs");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("cancel-in-progress: false");
    expect(workflow).toContain("queue: max");
    expect(workflow).toContain("Preserve release-owned menu bar feed");
    expect(workflow).toContain(
      "gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml",
    );
    expect(workflow).toContain("YTM_MENU_BAR_VERSION=$version");
    expect(workflow).toContain("Resolve published Windows tray release");
    expect(workflow).toContain(
      "scripts/ci/resolve-published-windows-tray-release.sh",
    );
    expect(workflow).toContain("Resolve published CLI release");
    expect(workflow).toContain("scripts/ci/resolve-published-cli-release.sh");
    expect(menuBarWorkflow).toContain(
      "scripts/ci/resolve-published-windows-tray-release.sh",
    );
    expect(menuBarWorkflow).toContain("group: pages");
    expect(menuBarWorkflow).toContain("queue: max");
    expect(menuBarWorkflow).toContain("cancel-in-progress: false");
    expect(resolver).toContain("YTM_WINDOWS_TRAY_VERSION=$version");
    expect(resolver).toContain("YTM_WINDOWS_TRAY_BUILD_NUMBER=$build_number");
    expect(resolver).toContain(
      'installer_asset="YTM-Tray-${version}-Setup.exe"',
    );
    expect(resolver).toContain("browser_download_url");
    expect(resolver).toContain("YTM_WINDOWS_TRAY_INSTALLER_URL=$installer_url");
    expect(resolver).toContain(
      "YTM_WINDOWS_TRAY_INSTALLER_AVAILABLE=$installer_available",
    );
    expect(resolver).toContain("html_url");
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
