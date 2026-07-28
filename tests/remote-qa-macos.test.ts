import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("macOS remote QA scaffold", () => {
  it("documents the remote macOS smoke path and scripts", () => {
    const docs = read("docs/remote-qa.md");
    const project = read("PROJECT.md");

    expect(docs).toContain("## Remote macOS QA Host");
    expect(docs).toContain(
      "Run the same smoke on the configured remote macOS host through Crabbox",
    );
    expect(project).toContain(
      "Windows validation through a remote macOS-hosted VM",
    );
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
    expect(docs).toContain(
      "The menu bar connector smoke supports Chromium, Edge, and Firefox",
    );
    expect(docs).toContain("REMOTE_QA_LINUX_CLI_CONNECTOR_PROJECTS");
  });

  it("does not print configured SSH credential paths", () => {
    const runner = read("scripts/remote/macos-qa/crabbox-run.sh");

    expect(runner).toContain(
      'echo "Remote QA SSH key not found or not readable." >&2',
    );
    expect(runner).not.toMatch(
      /echo\s+"[^"\n]*\$(?:host|user|work_root|ssh_key)\b/,
    );
  });

  it("redacts configured target values from Crabbox output", () => {
    if (process.platform === "win32") {
      return;
    }

    const fixtureRoot = mkdtempSync(join(tmpdir(), "ytme-crabbox-redaction-"));
    const fakeBin = join(fixtureRoot, "bin");
    const keyPath = join(fixtureRoot, "private-qa-key");
    const host = "private-host.fixture.invalid";
    const user = "private-fixture-user";
    const workRoot = "/private/fixture/work-root";
    const hostMixedCase = "PrIvAtE-HoSt.FiXtUrE.InVaLiD";
    const userMixedCase = "PrIvAtE-FiXtUrE-UsEr";
    const workRootMixedCase = "/PrIvAtE/FiXtUrE/WoRk-RoOt";
    const windowsHost = "private-windows-host.fixture.invalid";
    const windowsUser = "private-windows-fixture-user";
    const windowsWorkRoot = "C:\\Private\\Fixture\\WorkRoot";
    const windowsKeyPath = join(fixtureRoot, "private-windows-qa-key");
    const keyPathMixedCase = keyPath.toUpperCase();
    try {
      mkdirSync(fakeBin);
      writeFileSync(keyPath, "fixture key material never leaves this test");
      writeFileSync(
        windowsKeyPath,
        "fixture Windows key material never leaves this test",
      );
      const fakeCrabbox = join(fakeBin, "crabbox");
      writeFileSync(
        fakeCrabbox,
        [
          "#!/usr/bin/env sh",
          'printf "host=%s user=%s root=%s\\n" \\',
          '  "$REMOTE_QA_HOST" "$REMOTE_QA_USER" "$REMOTE_QA_WORK_ROOT"',
          'printf "key=%s\\n" "$CRABBOX_SSH_KEY" >&2',
          'printf "mixed-host=%s mixed-user=%s mixed-root=%s\\n" \\',
          '  "$YTME_PRIVATE_HOST_MIXED_CASE" \\',
          '  "$YTME_PRIVATE_USER_MIXED_CASE" \\',
          '  "$YTME_PRIVATE_WORK_ROOT_MIXED_CASE"',
          'printf "mixed-key=%s\\n" "$YTME_PRIVATE_KEY_MIXED_CASE" >&2',
          'printf "windows-host=%s windows-user=%s windows-root=%s\\n" \\',
          '  "$REMOTE_QA_WINDOWS_HOST" "$REMOTE_QA_WINDOWS_USER" \\',
          '  "$REMOTE_QA_WINDOWS_WORK_ROOT"',
          'printf "windows-key=%s\\n" "$REMOTE_QA_WINDOWS_SSH_KEY" >&2',
          "exit 23",
          "",
        ].join("\n"),
      );
      chmodSync(fakeCrabbox, 0o755);

      const result = spawnSync(
        "sh",
        [resolve(process.cwd(), "scripts/remote/macos-qa/crabbox-run.sh")],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
            REMOTE_QA_CONFIG: "/dev/null",
            REMOTE_QA_HOST: host,
            REMOTE_QA_USER: user,
            REMOTE_QA_PORT: "22",
            REMOTE_QA_WORK_ROOT: workRoot,
            REMOTE_QA_SSH_KEY: keyPath,
            YTME_PRIVATE_HOST_MIXED_CASE: hostMixedCase,
            YTME_PRIVATE_USER_MIXED_CASE: userMixedCase,
            YTME_PRIVATE_WORK_ROOT_MIXED_CASE: workRootMixedCase,
            YTME_PRIVATE_KEY_MIXED_CASE: keyPathMixedCase,
            REMOTE_QA_WINDOWS_HOST: windowsHost,
            REMOTE_QA_WINDOWS_USER: windowsUser,
            REMOTE_QA_WINDOWS_WORK_ROOT: windowsWorkRoot,
            REMOTE_QA_WINDOWS_SSH_KEY: windowsKeyPath,
          },
        },
      );

      expect(result.status).toBe(23);
      const output = `${result.stdout}${result.stderr}`;
      for (const privateValue of [
        host,
        user,
        workRoot,
        keyPath,
        windowsHost,
        windowsUser,
        windowsWorkRoot,
        windowsKeyPath,
        hostMixedCase,
        userMixedCase,
        workRootMixedCase,
        keyPathMixedCase,
      ]) {
        expect(output).not.toContain(privateValue);
      }
      expect(output).toContain("[remote-host]");
      expect(output).toContain("[remote-user]");
      expect(output).toContain("[remote-work-root]");
      expect(output).toContain("[remote-ssh-key]");
      expect(output).toContain("[windows-remote-host]");
      expect(output).toContain("[windows-remote-user]");
      expect(output).toContain("[windows-remote-work-root]");
      expect(output).toContain("[windows-remote-ssh-key]");
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it("automates macOS menu bar release package smoke", () => {
    const packageSmoke = read(
      "scripts/remote/macos-qa/menu-bar-package-smoke.sh",
    );

    expect(packageSmoke).toContain("SPARKLE_PUBLIC_ED_KEY");
    expect(packageSmoke).toContain("pnpm run menu-bar:test");
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
    expect(localButtonSmoke).toContain('playwright install "$install_browser"');
    expect(localButtonSmoke).toContain("dev:build:firefox");
    expect(localButtonSmoke).toContain(
      "Supported projects: chromium, edge, firefox",
    );
    expect(localButtonSmoke).toContain('pnpm run "$build_command"');
    expect(localButtonSmoke).toContain(
      "playwright test tests/e2e/menu-bar-connector.spec.ts",
    );
    expect(localButtonSmoke).toContain('--project="$project"');
    expect(localButtonSmoke).toContain("--workers=1");
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
    expect(menuBarE2e).toContain("Chromium, Edge, and Firefox");
    expect(menuBarE2e).toContain("UI elements enabled");
    expect(menuBarE2e).toContain("System Events");
    expect(menuBarE2e).toContain("Focus YouTube Music");
    expect(menuBarE2e).toContain("Open YouTube Music");
    expect(menuBarE2e).toContain("Quit");
  });

  it("runs Linux CLI connector smoke against Chromium and Firefox", () => {
    const cliConnectorSmoke = read(
      "scripts/remote/linux-qa/cli-connector-smoke.sh",
    );

    expect(cliConnectorSmoke).toContain(
      "REMOTE_QA_LINUX_CLI_CONNECTOR_PROJECTS:-chromium firefox",
    );
    expect(cliConnectorSmoke).toContain("dev:build:chrome");
    expect(cliConnectorSmoke).toContain("dev:build:firefox");
    expect(cliConnectorSmoke).toContain("YTME_E2E_CLI_CONNECTOR=1");
    expect(cliConnectorSmoke).toContain("--project=$project");
  });
});
