import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

function listRemoteShellScripts(directory: string): string[] {
  return readdirSync(resolve(process.cwd(), directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const repositoryPath = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      return listRemoteShellScripts(repositoryPath);
    }
    return repositoryPath.endsWith(".sh") ? [repositoryPath] : [];
  });
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

  it("keeps the documented remote QA script inventory bidirectional", () => {
    const docs = read("docs/remote-qa.md");
    const documentedScripts = new Set(
      docs.match(/scripts\/remote\/[A-Za-z0-9_./-]+\.sh/gu) ?? [],
    );
    const actualScripts = listRemoteShellScripts("scripts/remote").sort();

    expect(
      [...documentedScripts]
        .filter((path) => !existsSync(resolve(process.cwd(), path)))
        .sort(),
    ).toEqual([]);
    expect(
      actualScripts.filter((path) => !documentedScripts.has(path)),
    ).toEqual([]);
  });

  it("separates read-only OpenSSH audit from explicit remediation", () => {
    const auditPath = "scripts/windows-qa/audit-openssh.ps1";
    const auditCorePath = "scripts/windows-qa/openssh-audit-core.ps1";
    const remediationPath = "scripts/windows-qa/harden-openssh.ps1";

    expect(existsSync(resolve(process.cwd(), auditPath))).toBe(true);
    expect(existsSync(resolve(process.cwd(), auditCorePath))).toBe(true);

    const remediation = read(remediationPath);
    expect(remediation).toContain(
      '[ValidateSet("Prepare", "Apply", "Verify", "Rollback")]',
    );
    expect(remediation).toMatch(
      /\[Parameter\(Mandatory = \$true\)\]\s*\[ValidateSet/u,
    );
    expect(remediation).not.toContain('"Audit"');

    if (
      !existsSync(resolve(process.cwd(), auditPath)) ||
      !existsSync(resolve(process.cwd(), auditCorePath))
    ) {
      return;
    }

    const audit = read(auditPath);
    const auditCore = read(auditCorePath);
    const mutationCommand =
      /\b(?:Add-Content|Add-LocalGroupMember|Copy-Item|Disable-LocalUser|Disable-NetFirewallRule|Enable-LocalUser|Enable-NetFirewallRule|Move-Item|New-Item|New-LocalGroup|New-NetFirewallRule|Register-ScheduledTask|Remove-Item|Remove-LocalGroupMember|Remove-NetFirewallRule|Restart-Service|Set-Acl|Set-Content|Set-NetFirewallRule|Unregister-ScheduledTask)\b/u;
    const mutationFileApi =
      /\[IO\.File\]::(?:Move|Replace|WriteAllBytes|WriteAllLines|WriteAllText)/u;

    expect(audit).toContain("openssh-audit-core.ps1");
    expect(audit).toContain("Invoke-OpenSshAudit");
    for (const source of [audit, auditCore]) {
      expect(source).not.toMatch(mutationCommand);
      expect(source).not.toMatch(mutationFileApi);
    }
  });
});
