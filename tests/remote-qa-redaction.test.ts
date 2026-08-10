import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { describe, expect, it } from "vitest";

const redactionEnvironmentNames = [
  "YTME_REDACT_REMOTE_HOST",
  "YTME_REDACT_REMOTE_USER",
  "YTME_REDACT_REMOTE_WORK_ROOT",
  "YTME_REDACT_REMOTE_SSH_KEY",
  "YTME_REDACT_WINDOWS_REMOTE_HOST",
  "YTME_REDACT_WINDOWS_REMOTE_USER",
  "YTME_REDACT_WINDOWS_REMOTE_WORK_ROOT",
  "YTME_REDACT_WINDOWS_REMOTE_SSH_KEY",
] as const;

function cleanEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of redactionEnvironmentNames) {
    delete environment[name];
  }
  return environment;
}

function runRedactor(
  input: Buffer,
  environment: NodeJS.ProcessEnv = {},
): SpawnSyncReturns<string> {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-redactor-"));
  const inputPath = join(fixtureRoot, "output.bin");
  try {
    writeFileSync(inputPath, input);
    return spawnSync(
      process.execPath,
      [
        resolve(process.cwd(), "scripts/remote/redact-private-output.mjs"),
        inputPath,
      ],
      {
        encoding: "utf8",
        env: { ...cleanEnvironment(), ...environment },
      },
    );
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

describe("remote QA output redaction", () => {
  it("redacts the short hostname derived from a configured DNS name", () => {
    const result = runRedactor(
      Buffer.from("short=mac-mini full=mac-mini.local\n"),
      { YTME_REDACT_REMOTE_HOST: "mac-mini.local" },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("short=[remote-host] full=[remote-host]\n");
    expect(result.stdout).not.toContain("mac-mini");
  });

  it("decodes and redacts UTF-16LE command output", () => {
    const privateHost = "private-host.fixture.invalid";
    const input = Buffer.concat([
      Buffer.from([0xff, 0xfe]),
      Buffer.from(`host=${privateHost}\n`, "utf16le"),
    ]);
    const result = runRedactor(input, {
      YTME_REDACT_REMOTE_HOST: privateHost,
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toBe("host=[remote-host]\n");
    expect(result.stdout).not.toContain(privateHost);
    expect(result.stdout).not.toContain("\0");
  });

  it("fails closed on configured redaction values that are too short", () => {
    const result = runRedactor(Buffer.from("ordinary output\n"), {
      YTME_REDACT_REMOTE_USER: "xy",
    });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Remote QA redaction failed: a configured value is too short.",
    );
    expect(result.stderr).not.toContain("xy");
  });

  it("reports a safe byte offset for invalid command output", () => {
    const result = runRedactor(Buffer.from([0x61, 0x62, 0xff, 0x63]));

    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "Remote QA redaction failed for 4 bytes at byte offset 2.",
    );
    expect(result.stderr).not.toContain("output.bin");
  });

  it("renders both Crabbox channels before reporting a redaction failure", (t) => {
    t.skip(process.platform === "win32", "Requires a POSIX shell.");

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-crabbox-invalid-"));
    const fakeBin = join(fixtureRoot, "bin");
    const keyPath = join(fixtureRoot, "private-qa-key");
    try {
      mkdirSync(fakeBin);
      writeFileSync(keyPath, "fixture key material");
      const fakeCrabbox = join(fakeBin, "crabbox");
      writeFileSync(
        fakeCrabbox,
        "#!/usr/bin/env sh\nprintf '\\377'\nprintf '\\376' >&2\n",
      );
      chmodSync(fakeCrabbox, 0o755);

      const result = spawnSync(
        "sh",
        [resolve(process.cwd(), "scripts/remote/macos-qa/crabbox-run.sh")],
        {
          encoding: "utf8",
          env: {
            ...cleanEnvironment(),
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            REMOTE_QA_CONFIG: "/dev/null",
            REMOTE_QA_HOST: "private-host.fixture.invalid",
            REMOTE_QA_USER: "private-fixture-user",
            REMOTE_QA_PORT: "22",
            REMOTE_QA_WORK_ROOT: "/private/fixture/work-root",
            REMOTE_QA_SSH_KEY: keyPath,
          },
        },
      );

      expect(result.status).toBe(1);
      expect(
        result.stderr.match(/Remote QA redaction failed for 1 byte/g),
      ).toHaveLength(2);
      expect(result.stderr).toContain(
        "Remote QA output could not be rendered safely.",
      );
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
