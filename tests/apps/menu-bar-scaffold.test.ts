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
    expect(sources).toContain("MenuBarControlIcon.shuffle");
    expect(sources).toContain("MenuBarControlIcon.repeat");
    expect(sources).toContain("repeatIcon");
    expect(sources).toContain("setActive(");
    expect(sources).toContain("MenuBarStyle.controlHoverBackground");
    expect(sources).toContain("background = .clear");
    expect(sources).toContain("tintColor = .white");
    expect(sources).not.toContain("badgeLabel");
    expect(sources).not.toContain('"Playing"');
    expect(sources).not.toContain('"Paused"');
    expect(sources).not.toContain("MenuBarStyle.accentMuted");
  });

  it("reuses Mini Player SVG playback control icons in the menu bar view", () => {
    const manifest = read("Package.swift");
    const sourceFiles = listFiles("Sources/YTMMenuBarConnector");
    const sources = sourceFiles.map(read).join("\n");
    const controlIconResources = [
      "playback-play.svg",
      "playback-pause.svg",
      "playback-previous.svg",
      "playback-next.svg",
      "playback-shuffle.svg",
      "playback-repeat.svg",
      "playback-repeat-one.svg",
    ];

    for (const resource of controlIconResources) {
      expect(manifest).toContain(`.copy("Resources/${resource}")`);
      expect(sourceFiles).toContain(
        `Sources/YTMMenuBarConnector/Resources/${resource}`,
      );
    }

    expect(sources).toContain("enum MenuBarControlIcon");
    expect(sources).toContain('resourceName: "playback-play"');
    expect(sources).toContain('resourceName: "playback-repeat-one"');
    expect(sources).toContain("Bundle.module.url(forResource: resourceName");
    expect(sources).toContain("image.isTemplate = true");

    const controlsSource = sources.match(
      /final class MenuBarControlsView:[\s\S]+?private final class MenuBarArtworkView/,
    )?.[0];
    expect(controlsSource).toBeDefined();
    expect(controlsSource).not.toContain("systemSymbolName:");
    expect(controlsSource).not.toContain("setSystemSymbolName");
  });

  it("uses tint instead of persistent hover fill for active shuffle and repeat", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const iconButtonSource = sources.match(
      /private final class MenuBarIconButton:[\s\S]+$/,
    )?.[0];

    expect(iconButtonSource).toBeDefined();
    expect(sources).toContain("MenuBarStyle.controlInactiveTint");
    expect(iconButtonSource).toContain("let tintColor: NSColor");
    expect(iconButtonSource).toContain("if prominent || active || hovering");
    expect(iconButtonSource).toContain("contentTintColor = tintColor");
    expect(iconButtonSource).not.toContain(
      "background = MenuBarStyle.controlActiveBackground",
    );
  });

  it("shows artist beside year on the lower menu bar metadata line", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      'albumTextView.stringValue = state.album ?? ""',
    );
    expect(nowPlayingViewSource).toContain(
      "artistYearTextView.stringValue = formatArtistYearLine(state)",
    );
    expect(nowPlayingViewSource).toContain(
      "private func formatArtistYearLine(_ state: PlaybackState) -> String",
    );
    expect(nowPlayingViewSource).toContain("if let artist = state.artist");
    expect(nowPlayingViewSource).toContain("if let year = state.year");
    expect(nowPlayingViewSource).toContain(
      'parts.joined(separator: " \\u{00B7} ")',
    );
    expect(nowPlayingViewSource).not.toContain(
      "private func formatMetadataLines",
    );
    expect(nowPlayingViewSource).not.toContain(
      "albumTextView.stringValue = formatAlbumLine(state)",
    );
  });

  it("decodes next track metadata from connector playback state", () => {
    const protocolSource = read(
      "Sources/YTMMenuBarConnector/ConnectorProtocol.swift",
    );
    const appSource = read("Sources/YTMMenuBarConnector/ConnectorApp.swift");

    expect(protocolSource).toContain("struct TrackMetadata: Decodable");
    expect(protocolSource).toContain("let nextTrack: TrackMetadata?");
    expect(appSource).toContain(
      '"nextTrack=\\(logValue(state.nextTrack?.title))"',
    );
  });

  it("displays the next track below current playback and above Quit", () => {
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
    expect(nowPlayingViewSource).toContain("private let nextTrackLabel");
    expect(nowPlayingViewSource).toContain(
      "private let nextTrackTitleTextView",
    );
    expect(nowPlayingViewSource).toContain(
      "private let nextTrackDetailTextView",
    );
    expect(nowPlayingViewSource).toContain(
      'nextTrackLabel.stringValue = "Up Next"',
    );
    expect(nowPlayingViewSource).toContain("updateNextTrack(state.nextTrack)");
    expect(nowPlayingViewSource).toContain(
      "nextTrackTitleTextView.stringValue = title",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackDetailTextView.stringValue = formatTrackDetailLine(track)",
    );
    expect(nowPlayingViewSource).toContain(
      "NSSize(width: MenuBarStyle.width, height: 252)",
    );
    expect(nowPlayingViewSource).toContain("nextTrackDivider.frame =");
    expect(nowPlayingViewSource).toContain("addSubview(nextTrackLabel)");
    expect(nowPlayingViewSource).toContain(
      "addSubview(nextTrackTitleTextView)",
    );
    expect(nowPlayingViewSource).toContain(
      "addSubview(nextTrackDetailTextView)",
    );
    expect(controllerSource).toContain("menu.addItem(nowPlayingItem)");
    expect(controllerSource).toContain("menu.addItem(.separator())");
    expect(controllerSource).toContain("menu.addItem(quitItem)");
  });

  it("adds a circular Mini Player-style hover shadow to menu bar controls", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const iconButtonSource = sources.match(
      /private final class MenuBarIconButton:[\s\S]+$/,
    )?.[0];

    expect(iconButtonSource).toBeDefined();
    expect(sources).toContain("MenuBarStyle.controlHoverShadow");
    expect(iconButtonSource).toContain("layer?.masksToBounds = false");
    expect(iconButtonSource).toContain("layer?.shadowPath = CGPath(");
    expect(iconButtonSource).toContain("ellipseIn: bounds.insetBy");
    expect(iconButtonSource).toContain("layer?.shadowOpacity = shadowOpacity");
    expect(iconButtonSource).toContain("hovering || isHighlighted");
    expect(iconButtonSource).toContain(
      "MenuBarStyle.controlHoverShadow.cgColor",
    );
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

  it("uses a compact but roomier playback control layout", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];
    const controlsViewSource = sources.match(
      /final class MenuBarControlsView:[\s\S]+?private final class MenuBarArtworkView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      "NSSize(width: MenuBarStyle.width, height: 252)",
    );
    expect(nowPlayingViewSource).toContain(
      "controlsView.frame = NSRect(x: 0, y: 130, width: bounds.width, height: 52)",
    );
    expect(controlsViewSource).toBeDefined();
    expect(controlsViewSource).toContain(
      "NSSize(width: MenuBarStyle.width, height: 52)",
    );
    expect(controlsViewSource).toContain(
      "playPauseButton.frame = NSRect(x: centerX - 24, y: 2, width: 48, height: 48)",
    );
    expect(controlsViewSource).toContain(
      "previousButton.frame = NSRect(x: centerX - 76, y: 6, width: 40, height: 40)",
    );
    expect(controlsViewSource).toContain(
      "shuffleButton.frame = NSRect(x: centerX - 124, y: 8, width: 36, height: 36)",
    );
    expect(controlsViewSource).toContain(
      "nextButton.frame = NSRect(x: centerX + 36, y: 6, width: 40, height: 40)",
    );
    expect(controlsViewSource).toContain(
      "repeatButton.frame = NSRect(x: centerX + 88, y: 8, width: 36, height: 36)",
    );
  });

  it("uses live updates instead of a manual refresh menu item", () => {
    const appSource = read("Sources/YTMMenuBarConnector/ConnectorApp.swift");
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );

    expect(controllerSource).not.toContain("refreshItem");
    expect(controllerSource).not.toContain('title: "Refresh"');
    expect(controllerSource).not.toContain("onRefresh");
    expect(controllerSource).not.toContain("@objc private func refresh");
    expect(appSource).not.toContain("menu.onRefresh");
  });

  it("lets the default menu background show through the playback view", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      "override var allowsVibrancy: Bool { true }",
    );
    expect(nowPlayingViewSource).not.toContain("NSVisualEffectView");
    expect(nowPlayingViewSource).not.toContain("effectView");
    expect(nowPlayingViewSource).not.toContain(
      "layer?.backgroundColor = NSColor.clear.cgColor",
    );
    expect(nowPlayingViewSource).not.toContain(
      "effectView.frame = bounds.insetBy",
    );
    expect(nowPlayingViewSource).not.toContain(
      "layer?.backgroundColor = MenuBarStyle.background.cgColor",
    );
    expect(nowPlayingViewSource).not.toContain("effectView.layer?.borderWidth");
    expect(nowPlayingViewSource).not.toContain("effectView.layer?.borderColor");
  });

  it("scrolls overflowing title, album, and artist/year text in the menu bar view", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("MenuBarScrollingTextView");
    expect(sources).toContain("titleTextView");
    expect(sources).toContain("albumTextView");
    expect(sources).toContain("artistYearTextView");
    expect(sources).toContain("formatArtistYearLine");
    expect(sources).toContain("scrollPauseDelay");
    expect(sources).toContain("needsScroll");
    expect(sources).toContain("Timer(timeInterval:");
    expect(sources).toContain("RunLoop.main.add(timer, forMode: .common)");
    expect(sources).toContain("DispatchQueue.main.asyncAfter");
    expect(sources).not.toContain("titleLabel = NSTextField(labelWithString:");
  });

  it("scrolls title, album, and artist/year together from one metadata scroller", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];
    const scrollingViewSource = sources.match(
      /private final class MenuBarScrollingTextView:[\s\S]+?private final class MenuBarMetadataScroller/,
    )?.[0];
    const metadataScrollerSource = sources.match(
      /private final class MenuBarMetadataScroller[\s\S]+?final class MenuBarControlsView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      "metadataScroller.register(titleTextView)",
    );
    expect(nowPlayingViewSource).toContain(
      "metadataScroller.register(albumTextView)",
    );
    expect(nowPlayingViewSource).toContain(
      "metadataScroller.register(artistYearTextView)",
    );
    expect(scrollingViewSource).toBeDefined();
    expect(scrollingViewSource).toContain("func setScrollProgress");
    expect(scrollingViewSource).not.toContain("Timer(timeInterval:");
    expect(metadataScrollerSource).toBeDefined();
    expect(metadataScrollerSource).toContain("scrollingTextViews");
    expect(metadataScrollerSource).toContain("maximumScrollDistance");
    expect(metadataScrollerSource).toContain("setScrollProgress(progress)");
    expect(metadataScrollerSource).toContain(
      "RunLoop.main.add(timer, forMode: .common)",
    );
  });

  it("keeps scrolling menu bar text anchored during layout", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");

    expect(sources).toContain("private var scrollOffset: CGFloat = 0");
    expect(sources).toContain("setScrollProgress(0)");
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
    expect(scrollingViewSource).toContain("setScrollProgress");
    expect(scrollingViewSource).not.toContain("NSClipView");
    expect(scrollingViewSource).not.toContain("NSTextField(labelWithString:");
    expect(scrollingViewSource).not.toContain("clipView.scroll(to:");
    expect(scrollingViewSource).not.toContain("clipView.animator()");
    expect(scrollingViewSource).not.toContain("label.animator()");
    expect(scrollingViewSource).not.toContain("setAffineTransform");
    expect(scrollingViewSource).not.toContain("translationX:");
    expect(scrollingViewSource).not.toContain("reflectScrolledClipView");
  });

  it("loops scrolling menu bar text back to the start instead of snapping", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const scrollingViewSource = sources.match(
      /private final class MenuBarScrollingTextView:[\s\S]+?private final class MenuBarMetadataScroller/,
    )?.[0];
    const metadataScrollerSource = sources.match(
      /private final class MenuBarMetadataScroller[\s\S]+?final class MenuBarControlsView/,
    )?.[0];

    expect(scrollingViewSource).toBeDefined();
    expect(scrollingViewSource).toContain(
      "private static let scrollLoopGap: CGFloat",
    );
    expect(scrollingViewSource).toContain("var scrollDistance: CGFloat");
    expect(scrollingViewSource).toContain("lastTextWidth + Self.scrollLoopGap");
    expect(scrollingViewSource).toContain("drawLoopingCopy");
    expect(scrollingViewSource).toContain(
      "NSPoint(x: -scrollOffset + lastTextWidth + Self.scrollLoopGap",
    );
    expect(metadataScrollerSource).toBeDefined();
    expect(metadataScrollerSource).toContain("maximumScrollDistance");
    expect(metadataScrollerSource).toContain("scrollDistance");
    expect(metadataScrollerSource).not.toContain("maximumOverflow");
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
