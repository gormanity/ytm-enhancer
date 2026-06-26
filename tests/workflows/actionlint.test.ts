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
});
