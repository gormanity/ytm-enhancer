import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("YTM Enhancer CLI app scaffold", () => {
  it("defines Go entrypoints for the CLI and native host", () => {
    expect(read("apps/cli/go.mod")).toContain(
      "module github.com/gormanity/ytm-enhancer/apps/cli",
    );
    expect(read("apps/cli/cmd/ytme/main.go")).toContain("cli.App{}.Run");
    expect(read("apps/cli/cmd/ytme-native-host/main.go")).toContain(
      "connector.Run",
    );
  });

  it("uses the shared connector protocol identifiers", () => {
    const protocolSource = read("apps/cli/internal/protocol/protocol.go");

    expect(protocolSource).toContain(
      'ConnectorID      = "com.gormanity.ytm-enhancer.cli"',
    );
    expect(protocolSource).toContain(
      'HostName         = "com.gormanity.ytm_enhancer.cli"',
    );
    expect(protocolSource).toContain('ProtocolVersion  = "1.0.0"');
    expect(protocolSource).toContain('"playback:control"');
    expect(protocolSource).toContain('"ytm:focus"');
  });

  it("installs local native messaging manifests and a ytme command", () => {
    const installScript = read("apps/cli/scripts/install-native-hosts.sh");
    const uninstallScript = read("apps/cli/scripts/uninstall-native-hosts.sh");

    expect(installScript).toContain(
      'HOST_NAME="com.gormanity.ytm_enhancer.cli"',
    );
    expect(installScript).toContain('go -C "$APP_ROOT" build');
    expect(installScript).toContain('CLI_PATH="$CLI_BIN_DIR/ytme"');
    expect(installScript).toContain("path_contains_dir");
    expect(installScript).toContain("print_next_steps");
    expect(installScript).toContain("build_cli");
    expect(installScript).toContain('HOST_OS="${YTME_HOST_OS:-$(uname -s)}"');
    expect(installScript).toContain("allowed_origins");
    expect(installScript).toContain("allowed_extensions");
    expect(installScript).toContain(
      '"$XDG_CONFIG_HOME/google-chrome/NativeMessagingHosts"',
    );
    expect(installScript).toContain('"$HOME/.mozilla/native-messaging-hosts"');
    expect(uninstallScript).toContain(
      'HOST_NAME="com.gormanity.ytm_enhancer.cli"',
    );
    expect(uninstallScript).toContain('CLI_PATH="$CLI_BIN_DIR/ytme"');
    expect(uninstallScript).toContain(
      '"$XDG_CONFIG_HOME/google-chrome/NativeMessagingHosts/$HOST_NAME.json"',
    );
    expect(uninstallScript).toContain(
      '"$HOME/.mozilla/native-messaging-hosts/$HOST_NAME.json"',
    );
  });

  it("registers the CLI as a first-party Connected App", () => {
    const settingsSource = read("src/core/connectors/settings.ts");

    expect(settingsSource).toContain(
      'FIRST_PARTY_CLI_CONNECTOR_ID = "com.gormanity.ytm-enhancer.cli"',
    );
    expect(settingsSource).toContain(
      'FIRST_PARTY_CLI_NATIVE_HOST_NAME =\n  "com.gormanity.ytm_enhancer.cli"',
    );
    expect(settingsSource).toContain('name: "YTM Enhancer CLI"');
    expect(settingsSource).toContain('installLabel: "Install CLI"');
  });
});
