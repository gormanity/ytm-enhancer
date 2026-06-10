import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NATIVE_MESSAGING_HOST_NAME } from "@/core/connectors/native-messaging-transport";

const appRoot = resolve(process.cwd(), "apps/menu-bar");

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), "utf-8");
}

function listFiles(dir: string): string[] {
  const absolute = resolve(appRoot, dir);
  return readdirSync(absolute).flatMap((entry) => {
    const path = join(absolute, entry);
    const relativePath = path.slice(appRoot.length + 1);
    return statSync(path).isDirectory()
      ? listFiles(relativePath)
      : relativePath;
  });
}

describe("menu bar connector app scaffold", () => {
  it("defines a native Swift menu bar executable", () => {
    const manifest = read("Package.swift");

    expect(manifest).toContain("YTMMenuBarConnector");
    expect(manifest).toContain("AppKit");
    expect(manifest).not.toContain("Electron");
    expect(manifest).not.toContain("Tauri");
  });

  it("speaks the connector protocol over native messaging stdio", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain(NATIVE_MESSAGING_HOST_NAME);
    expect(sources).toContain("connector.hello");
    expect(sources).toContain("connector.subscribe");
    expect(sources).toContain("playback.getState");
    expect(sources).toContain("playback.action");
    expect(sources).toContain("playback.state");
    expect(sources).toContain("FileHandle.standardInput");
    expect(sources).toContain("FileHandle.standardOutput");
  });

  it("writes local debug logs for connector diagnostics", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("NativeAppLogger");
    expect(sources).toContain("YTM_MENU_BAR_LOG_PATH");
    expect(sources).toContain("/tmp/ytm-menu-bar-connector.log");
    expect(sources).toContain("received message");
    expect(sources).toContain("sending message");
    expect(sources).toContain("playback state");
  });

  it("retries transient startup playback state errors", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("Waiting for YouTube Music");
    expect(sources).toContain("schedulePlaybackStateRetry");
    expect(sources).toContain("isPlaybackStateRequestError");
    expect(sources).toContain("Receiving end does not exist");
    expect(sources).toContain("playback state retry scheduled");
  });

  it("uses custom Mini Player-style menu views for playback status and controls", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("MenuBarNowPlayingView");
    expect(sources).toContain("MenuBarControlsView");
    expect(sources).toContain("NSVisualEffectView");
    expect(sources).toContain("systemSymbolName");
    expect(sources).toContain("progressFill");
    expect(sources).toContain("artworkView");
    expect(sources).not.toContain('NSMenuItem(title: "Previous"');
  });

  it("scrolls overflowing title and album text in the menu bar view", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("MenuBarScrollingTextView");
    expect(sources).toContain("titleTextView");
    expect(sources).toContain("albumTextView");
    expect(sources).toContain("formatAlbumLine");
    expect(sources).toContain("scrollPauseDelay");
    expect(sources).toContain("needsScroll");
    expect(sources).toContain("NSAnimationContext.runAnimationGroup");
    expect(sources).toContain("DispatchQueue.main.asyncAfter");
    expect(sources).not.toContain("titleLabel = NSTextField(labelWithString:");
  });

  it("reuses the extension icon for the menu bar status item", () => {
    const manifest = read("Package.swift");
    const sourceFiles = listFiles("Sources/YTMMenuBarConnector");
    const sources = sourceFiles.map(read).join("\n");

    expect(manifest).toContain('.copy("Resources/extension-icon.svg")');
    expect(sourceFiles).toContain(
      "Sources/YTMMenuBarConnector/Resources/extension-icon.svg",
    );
    expect(sources).toContain(
      'Bundle.module.url(forResource: "extension-icon", withExtension: "svg")',
    );
    expect(sources).toContain("MenuBarStatusIcon.extensionIcon()");
    expect(sources).not.toContain(
      'systemSymbolName: isPlaying ? "music.note" : "music.note.list"',
    );
  });

  it("uses a monochrome template icon for the macOS status item", () => {
    const manifest = read("Package.swift");
    const sourceFiles = listFiles("Sources/YTMMenuBarConnector");
    const sources = sourceFiles.map(read).join("\n");
    const icon = read(
      "Sources/YTMMenuBarConnector/Resources/extension-icon-monochrome.svg",
    );

    expect(manifest).toContain(
      '.copy("Resources/extension-icon-monochrome.svg")',
    );
    expect(sourceFiles).toContain(
      "Sources/YTMMenuBarConnector/Resources/extension-icon-monochrome.svg",
    );
    expect(sources).toContain(
      'Bundle.module.url(forResource: "extension-icon-monochrome", withExtension: "svg")',
    );
    expect(sources).toContain("MenuBarStatusIcon.monochromeIcon()");
    expect(sources).toContain("image.isTemplate = true");
    expect(icon).toContain('fill="#000000"');
    expect(icon).toContain('fill-rule="evenodd"');
    expect(icon).not.toContain("#F03030");
    expect(icon).not.toContain("#33ffff");
  });

  it("keeps the app isolated from extension internals", () => {
    const sources = listFiles(".")
      .filter((path) => /\.(swift|md|sh)$/.test(path))
      .map(read)
      .join("\n");

    expect(sources).not.toContain("@/");
    expect(sources).not.toContain("src/");
    expect(sources).not.toContain("music.youtube.com");
  });

  it("includes a macOS native host installer", () => {
    const script = read("scripts/install-native-hosts.sh");

    expect(script).toContain(NATIVE_MESSAGING_HOST_NAME);
    expect(script).toContain("scripts/uninstall-native-hosts.sh");
    expect(script).toContain("Google/Chrome/NativeMessagingHosts");
    expect(script).toContain("Microsoft Edge/NativeMessagingHosts");
    expect(script).toContain("Mozilla/NativeMessagingHosts");
    expect(script).toContain("allowed_origins");
    expect(script).toContain("allowed_extensions");
  });

  it("includes a macOS native host uninstaller", () => {
    const script = read("scripts/uninstall-native-hosts.sh");

    expect(script).toContain(NATIVE_MESSAGING_HOST_NAME);
    expect(script).toContain("Google/Chrome/NativeMessagingHosts");
    expect(script).toContain("Microsoft Edge/NativeMessagingHosts");
    expect(script).toContain("Mozilla/NativeMessagingHosts");
    expect(script).toContain("rm -f");
  });
});
