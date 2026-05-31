import { describe, it, expect } from "vitest";
import chromeManifest from "../../src/manifests/chrome.json";
import firefoxManifest from "../../src/manifests/firefox.json";
import edgeManifest from "../../src/manifests/edge.json";
import backgroundSource from "../../src/background/index.ts?raw";
import hotkeysModuleSource from "../../src/modules/hotkeys/index.ts?raw";
import notificationsModuleSource from "../../src/modules/notifications/index.ts?raw";
import playbackControlsModuleSource from "../../src/modules/playback-controls/index.ts?raw";

function getManifestCommands(manifest: Record<string, unknown>): string[] {
  const commands = manifest.commands as Record<string, unknown> | undefined;
  return commands ? Object.keys(commands) : [];
}

const expectedCommandOrder = [
  "play-pause",
  "next-track",
  "previous-track",
  "focus-ytm-tab",
  "remind-me",
];

function getRegisteredCommands(): string[] {
  const commands = new Set<string>();
  const sources = [
    backgroundSource,
    hotkeysModuleSource,
    notificationsModuleSource,
    playbackControlsModuleSource,
  ];

  for (const source of sources) {
    const directPattern = /\.register\("([^"]+)"/g;
    let match;
    while ((match = directPattern.exec(source)) !== null) {
      commands.add(match[1]);
    }

    const mapPattern = /COMMAND_ACTION_MAP[^}]*\{([^}]+)\}/s;
    const mapMatch = mapPattern.exec(source);
    if (mapMatch) {
      const keyPattern = /"([^"]+)":/g;
      let keyMatch;
      while ((keyMatch = keyPattern.exec(mapMatch[1])) !== null) {
        commands.add(keyMatch[1]);
      }
    }
  }

  return [...commands].sort();
}

describe("hotkey manifest sync", () => {
  const registered = getRegisteredCommands();

  it("should have at least one registered command", () => {
    expect(registered.length).toBeGreaterThan(0);
  });

  const manifests = [
    { name: "chrome", manifest: chromeManifest },
    { name: "firefox", manifest: firefoxManifest },
    { name: "edge", manifest: edgeManifest },
  ];

  for (const { name, manifest } of manifests) {
    describe(`src/manifests/${name}.json`, () => {
      const manifestCommands = getManifestCommands(manifest).sort();

      it("every manifest command should have a registered handler", () => {
        const missing = manifestCommands.filter(
          (cmd) => !registered.includes(cmd),
        );
        expect(
          missing,
          `Commands in manifest but not registered: ${missing.join(", ")}`,
        ).toEqual([]);
      });

      it("every registered handler should have a manifest command", () => {
        const extra = registered.filter(
          (cmd) => !manifestCommands.includes(cmd),
        );
        expect(
          extra,
          `Commands registered but not in manifest: ${extra.join(", ")}`,
        ).toEqual([]);
      });

      it("should keep commands in the shared display order", () => {
        expect(getManifestCommands(manifest)).toEqual(expectedCommandOrder);
      });
    });
  }
});
