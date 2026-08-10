import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function writeExecutable(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
  chmodSync(path, 0o755);
}

function platformReturnPattern(): RegExp {
  return /if \(process\.platform (?:===|!==) "win32"\) \{\s+return;\s+\}/u;
}

describe("remote QA verification contracts", () => {
  it("declares unavailable platform checks as skipped", () => {
    for (const path of [
      "tests/remote-qa-macos.test.ts",
      "tests/remote-qa-windows.test.ts",
    ]) {
      expect(read(path), path).not.toMatch(platformReturnPattern());
    }
  });

  it.skipIf(process.platform === "win32")(
    "requires macOS menu bar buttons by default only on the remote host",
    () => {
      const fixtureRoot = mkdtempSync(
        join(tmpdir(), "ytme-remote-macos-strict-"),
      );
      const wrapperDir = join(fixtureRoot, "scripts", "remote", "macos-qa");
      const wrapper = join(wrapperDir, "menu-bar-button-smoke.sh");
      try {
        mkdirSync(wrapperDir, { recursive: true });
        copyFileSync(
          resolve(
            process.cwd(),
            "scripts/remote/macos-qa/menu-bar-button-smoke.sh",
          ),
          wrapper,
        );
        chmodSync(wrapper, 0o755);
        writeExecutable(
          join(wrapperDir, "crabbox-run.sh"),
          '#!/usr/bin/env sh\nprintf "%s\\n" "$*"\n',
        );

        const baseEnvironment = { ...process.env };
        delete baseEnvironment.REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS;
        const strictResult = spawnSync("sh", [wrapper], {
          encoding: "utf8",
          env: baseEnvironment,
        });
        expect(strictResult.status, strictResult.stderr).toBe(0);
        expect(strictResult.stdout).toContain(
          "YTME_MENU_BAR_REQUIRE_BUTTONS=1",
        );

        const permissiveResult = spawnSync("sh", [wrapper], {
          encoding: "utf8",
          env: {
            ...baseEnvironment,
            REMOTE_QA_MENU_BAR_REQUIRE_BUTTONS: "0",
          },
        });
        expect(permissiveResult.status, permissiveResult.stderr).toBe(0);
        expect(permissiveResult.stdout).toContain(
          "YTME_MENU_BAR_REQUIRE_BUTTONS=0",
        );
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "dispatches a named QA suite and reports its verified contract",
    () => {
      const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-qa-dispatch-"));
      const dispatcher = join(fixtureRoot, "scripts", "remote", "qa.sh");
      try {
        mkdirSync(dirname(dispatcher), { recursive: true });
        copyFileSync(
          resolve(process.cwd(), "scripts/remote/qa.sh"),
          dispatcher,
        );
        chmodSync(dispatcher, 0o755);
        writeExecutable(
          join(fixtureRoot, "scripts", "remote", "macos-qa", "check.sh"),
          '#!/usr/bin/env sh\necho "fixture wrapper ran"\n',
        );

        const result = spawnSync("sh", [dispatcher, "macos", "check"], {
          encoding: "utf8",
        });

        expect(result.status, result.stderr).toBe(0);
        expect(result.stdout).toContain("QA START macos/check");
        expect(result.stdout).toContain("fixture wrapper ran");
        expect(result.stdout).toContain(
          "QA VERIFIED macos/check: CI-equivalent project checks",
        );
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform === "win32")(
    "reports a failed QA suite without converting its status",
    () => {
      const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-qa-failure-"));
      const dispatcher = join(fixtureRoot, "scripts", "remote", "qa.sh");
      try {
        mkdirSync(dirname(dispatcher), { recursive: true });
        copyFileSync(
          resolve(process.cwd(), "scripts/remote/qa.sh"),
          dispatcher,
        );
        chmodSync(dispatcher, 0o755);
        writeExecutable(
          join(fixtureRoot, "scripts", "remote", "windows-qa", "check.sh"),
          "#!/usr/bin/env sh\nexit 7\n",
        );

        const result = spawnSync("sh", [dispatcher, "windows", "check"], {
          encoding: "utf8",
        });

        expect(result.status).toBe(7);
        expect(result.stderr).toContain("QA FAILED windows/check (exit 7)");
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it("lists the QA entry points exposed through mise", () => {
    const mise = read(".mise.toml");
    const dispatcher = read("scripts/remote/qa.sh");

    expect(mise).toContain("[tasks.qa]");
    expect(mise).toContain("[tasks.qa-list]");
    expect(mise).toContain("[tasks.qa-macos-check]");
    expect(mise).toContain("[tasks.qa-windows-check]");
    expect(dispatcher).toContain('case "$platform/$suite" in');
    expect(dispatcher).toContain("Usage:");
  });
});
