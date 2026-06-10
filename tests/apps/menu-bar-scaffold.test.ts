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

  it("matches Mini Player playback controls in the menu bar view", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("shuffleButton");
    expect(sources).toContain("previousButton");
    expect(sources).toContain("playPauseButton");
    expect(sources).toContain("nextButton");
    expect(sources).toContain("repeatButton");
    expect(sources).toContain('systemSymbolName: "shuffle"');
    expect(sources).toContain('systemSymbolName: "repeat"');
    expect(sources).toContain("repeatSystemSymbolName");
    expect(sources).toContain("setActive(");
    expect(sources).toContain("MenuBarStyle.controlHoverBackground");
    expect(sources).toContain("background = .clear");
    expect(sources).toContain("contentTintColor = .white");
    expect(sources).not.toContain("badgeLabel");
    expect(sources).not.toContain('"Playing"');
    expect(sources).not.toContain('"Paused"');
    expect(sources).not.toContain("MenuBarStyle.accentMuted");
  });

  it("keeps menu bar playback controls in the same card as playback state", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      "private let controlsView = MenuBarControlsView()",
    );
    expect(nowPlayingViewSource).toContain("controlsView.frame =");
    expect(nowPlayingViewSource).toContain("addSubview(controlsView)");
    expect(controllerSource).not.toContain(
      "private let controlsView = MenuBarControlsView()",
    );
    expect(controllerSource).not.toContain("controlsItem");
    expect(controllerSource).not.toContain("menu.addItem(controlsItem)");
  });

  it("scrolls overflowing title, artist, and album text in the menu bar view", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("MenuBarScrollingTextView");
    expect(sources).toContain("titleTextView");
    expect(sources).toContain("artistTextView");
    expect(sources).toContain("albumTextView");
    expect(sources).toContain("formatAlbumLine");
    expect(sources).toContain("scrollPauseDelay");
    expect(sources).toContain("needsScroll");
    expect(sources).toContain("Timer(timeInterval:");
    expect(sources).toContain("RunLoop.main.add(timer, forMode: .common)");
    expect(sources).toContain("DispatchQueue.main.asyncAfter");
    expect(sources).not.toContain("titleLabel = NSTextField(labelWithString:");
    expect(sources).not.toContain("artistLabel = NSTextField(labelWithString:");
  });

  it("keeps scrolling menu bar text anchored during layout", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("private var scrollOffset: CGFloat = 0");
    expect(sources).toContain("applyScrollOffset(0)");
    expect(sources).toContain("NSPoint(x: -scrollOffset");
    expect(sources).not.toContain("currentScrollOffset");
    expect(sources).not.toContain("labelFrame(offset:");
    expect(sources).not.toContain("applyLabelFrame(offset:");
    expect(sources).not.toContain("x: label.frame.minX");
  });

  it("draws scrolling menu bar text directly without clip view animation", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const scrollingViewSource = sources.match(
      /private final class MenuBarScrollingTextView:[\s\S]+?final class MenuBarControlsView/,
    )?.[0];

    expect(scrollingViewSource).toBeDefined();
    expect(scrollingViewSource).toContain("override func draw");
    expect(scrollingViewSource).toContain("(text as NSString).draw");
    expect(scrollingViewSource).toContain("applyScrollOffset");
    expect(scrollingViewSource).not.toContain("NSClipView");
    expect(scrollingViewSource).not.toContain("NSTextField(labelWithString:");
    expect(scrollingViewSource).not.toContain("clipView.scroll(to:");
    expect(scrollingViewSource).not.toContain("clipView.animator()");
    expect(scrollingViewSource).not.toContain("label.animator()");
    expect(scrollingViewSource).not.toContain("setAffineTransform");
    expect(scrollingViewSource).not.toContain("translationX:");
    expect(scrollingViewSource).not.toContain("reflectScrolledClipView");
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
