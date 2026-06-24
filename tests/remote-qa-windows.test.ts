import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("Windows remote QA scaffold", () => {
  it("documents the bowfin Windows VM path and environment", () => {
    const docs = read("docs/remote-qa.md");

    expect(docs).toContain("## Windows On Bowfin");
    expect(docs).toContain("Windows 11 ARM VM");
    expect(docs).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(docs).toContain("REMOTE_QA_WINDOWS_WORK_ROOT");
    expect(docs).toContain("Windows native messaging QA is not wired yet");
  });

  it("bridges through the macOS Crabbox runner into Windows OpenSSH", () => {
    const runner = read("scripts/remote/windows-qa/crabbox-run.sh");

    expect(runner).toContain(
      'macos_runner="$repo_root/scripts/remote/macos-qa/crabbox-run.sh"',
    );
    expect(runner).toContain("REMOTE_QA_WINDOWS_HOST");
    expect(runner).toContain("powershell.exe");
    expect(runner).toContain("-EncodedCommand");
    expect(runner).toContain("COPYFILE_DISABLE=1 tar -czf -");
    expect(runner).toContain("tar -xzf - -C \\$target");
  });

  it("uses Windows-native checks instead of the POSIX check script", () => {
    const check = read("scripts/remote/windows-qa/check.ps1");

    expect(check).toContain("Invoke-Native pnpm run format:check");
    expect(check).toContain("Invoke-Native pnpm run lint");
    expect(check).toContain("Invoke-Native go -C apps/cli test ./...");
    expect(check).toContain("Invoke-Native pnpm run dev:build:edge");
    expect(check).not.toContain("pnpm run check");
  });

  it("keeps Windows browser e2e scoped to Edge", () => {
    const e2e = read("scripts/remote/windows-qa/e2e-edge-smoke.ps1");

    expect(e2e).toContain("Invoke-Native pnpm run dev:build:edge");
    expect(e2e).toContain("playwright test tests/e2e --project=edge");
  });
});
