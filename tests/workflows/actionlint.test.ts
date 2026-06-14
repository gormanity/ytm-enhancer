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
    expect(ciWorkflow).toContain("rhysd/actionlint@v1");
    expect(ciWorkflow).toContain("Lint GitHub Actions workflows");
    expect(packageJson.scripts["workflow:check"]).toBe("actionlint");
  });
});
