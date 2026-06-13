import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NATIVE_MESSAGING_HOST_NAME } from "@/core/connectors/native-messaging-transport";

const appRoot = resolve(process.cwd(), "apps/menu-bar");

function read(relativePath: string): string {
  return readFileSync(resolve(appRoot, relativePath), "utf-8");
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(read(relativePath)) as T;
}

function listFiles(dir: string): string[] {
  const absolute = resolve(appRoot, dir);
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === ".build") return [];
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
    expect(sources).toContain("playback.seek");
    expect(sources).toContain("ytm.focus");
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
    expect(sources).toContain('"repeat=\\(state.repeatMode ?? "nil")"');
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

  it("marks playback state stale when live updates stop arriving", () => {
    const appSource = read("Sources/YTMMenuBarConnector/ConnectorApp.swift");
    const viewSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");

    expect(appSource).toContain("playbackStateStaleTimeoutSeconds");
    expect(appSource).toContain("schedulePlaybackStateStaleTimeout");
    expect(appSource).toContain("markPlaybackStateStale");
    expect(appSource).toContain("clearPlaybackStateStaleTimeout");
    expect(viewSource).toContain("setStalePlaybackState");
    expect(viewSource).toContain('"Reconnecting..."');
    expect(viewSource).toContain("controlsView.setPlaybackControlsDimmed");
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

  it("makes the menu bar progress bar seekable", () => {
    const protocolSource = read(
      "Sources/YTMMenuBarConnector/ConnectorProtocol.swift",
    );
    const appSource = read("Sources/YTMMenuBarConnector/ConnectorApp.swift");
    const viewSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");

    expect(protocolSource).toContain("static func playbackSeek");
    expect(protocolSource).toContain('"type": "playback.seek"');
    expect(appSource).toContain("menu.onSeek");
    expect(appSource).toContain("sendSeek");
    expect(viewSource).toContain("MenuBarSeekBarView");
    expect(viewSource).toContain("onSeek");
    expect(viewSource).toContain("mouseDown");
    expect(viewSource).toContain("mouseDragged");
    expect(viewSource).toContain("setSeekEnabled");
  });

  it("adds a menu action for focusing YouTube Music", () => {
    const protocolSource = read(
      "Sources/YTMMenuBarConnector/ConnectorProtocol.swift",
    );
    const appSource = read("Sources/YTMMenuBarConnector/ConnectorApp.swift");
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );

    expect(protocolSource).toContain("ytm:focus");
    expect(protocolSource).toContain("static func focusYouTubeMusic");
    expect(protocolSource).toContain('"type": "ytm.focus"');
    expect(appSource).toContain("menu.onFocusYouTubeMusic");
    expect(appSource).toContain("sendFocusYouTubeMusic");
    expect(controllerSource).toContain("onFocusYouTubeMusic");
    expect(controllerSource).toContain('title: "Focus YouTube Music"');
    expect(controllerSource).toContain("menu.addItem(focusItem)");
  });

  it("shows clearer unavailable states in the menu bar app", () => {
    const appSource = read("Sources/YTMMenuBarConnector/ConnectorApp.swift");
    const viewSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");

    expect(appSource).toContain("userFacingStatus");
    expect(appSource).toContain('"Connected Apps disabled"');
    expect(appSource).toContain('"Connector disabled"');
    expect(appSource).toContain('"Update required"');
    expect(appSource).toContain('"No YouTube Music tab"');
    expect(viewSource).toContain("isUnavailablePlaybackState");
    expect(viewSource).toContain('"No track loaded"');
    expect(viewSource).toContain("controlsView.setPlaybackControlsDimmed");
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

  it("uses distinct repeat-one iconography for the menu bar repeat control", () => {
    const repeatIcon = read(
      "Sources/YTMMenuBarConnector/Resources/playback-repeat.svg",
    );
    const repeatOneIcon = read(
      "Sources/YTMMenuBarConnector/Resources/playback-repeat-one.svg",
    );
    const viewsSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");
    const controlsSource = viewsSource.match(
      /final class MenuBarControlsView:[\s\S]+?private final class MenuBarArtworkView/,
    )?.[0];
    const iconButtonSource = viewsSource.match(
      /private final class MenuBarIconButton:[\s\S]+$/,
    )?.[0];

    expect(repeatOneIcon).not.toBe(repeatIcon);
    expect(repeatOneIcon).toContain('data-icon-part="repeat-one-marker"');
    expect(repeatOneIcon).toContain('d="M12.8 15.6V8.4');
    expect(repeatOneIcon).toContain('stroke-width="1.6"');
    expect(repeatOneIcon).toContain("Repeat one");
    expect(controlsSource).toContain(
      "repeatButton.setRepeatMarker(repeatMarker(repeatMode))",
    );
    expect(controlsSource).toContain(
      'repeatMode == "one" ? MenuBarControlIcon.repeatOne : MenuBarControlIcon.repeat',
    );
    expect(controlsSource).toContain('case "all":');
    expect(controlsSource).toContain("return .dot");
    expect(iconButtonSource).toContain("enum Marker");
    expect(iconButtonSource).toContain("func setRepeatMarker");
    expect(iconButtonSource).toContain("private func drawRepeatMarker");
    expect(iconButtonSource).toContain("ovalIn: markerRect.insetBy");
    expect(controlsSource).not.toContain("return .numberOne");
    expect(iconButtonSource).not.toContain("case numberOne");
    expect(iconButtonSource).not.toContain("drawRepeatOneMarker");
    expect(iconButtonSource).not.toContain(
      "NSColor.black.withAlphaComponent(isEnabled",
    );
    expect(iconButtonSource).not.toContain(
      "NSBezierPath(ovalIn: markerRect).fill()",
    );
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
      "private let nextTrackArtworkView = MenuBarNextTrackArtworkView()",
    );
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
      'nextTrackDetailTextView.stringValue = track.artist ?? ""',
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackArtworkView.update(artworkUrl: track.artworkUrl)",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackArtworkView.showPlaceholder()",
    );
    expect(nowPlayingViewSource).toContain(
      "NSSize(width: MenuBarStyle.width, height: 252)",
    );
    expect(nowPlayingViewSource).toContain("nextTrackArtworkView.frame =");
    expect(nowPlayingViewSource).toContain("nextTrackDivider.frame =");
    expect(nowPlayingViewSource).toContain("addSubview(nextTrackArtworkView)");
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

  it("renders next track artwork as a muted monochrome thumbnail", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nextTrackArtworkSource = sources.match(
      /private final class MenuBarNextTrackArtworkView:[\s\S]+?private final class MenuBarIconButton/,
    )?.[0];

    expect(nextTrackArtworkSource).toBeDefined();
    expect(nextTrackArtworkSource).toContain("NSImageView");
    expect(nextTrackArtworkSource).toContain("CIPhotoEffectMono");
    expect(nextTrackArtworkSource).toContain("alphaValue = 0.34");
    expect(nextTrackArtworkSource).toContain(
      'imageView.layer?.compositingFilter = "plusLighter"',
    );
    expect(nextTrackArtworkSource).toContain("layer?.borderColor");
    expect(nextTrackArtworkSource).toContain("showPlaceholder()");
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
    expect(sources).toContain("MenuBarStyle.controlHoverBorder");
    expect(iconButtonSource).toContain("layer?.masksToBounds = false");
    expect(iconButtonSource).toContain("layer?.shadowPath = CGPath(");
    expect(iconButtonSource).toContain("ellipseIn: bounds.insetBy");
    expect(iconButtonSource).toContain("layer?.shadowOpacity = shadowOpacity");
    expect(iconButtonSource).toContain(".mouseMoved");
    expect(iconButtonSource).toContain("override func mouseMoved");
    expect(iconButtonSource).toContain("updateHoverState(");
    expect(iconButtonSource).toContain("isMouseInsideBounds");
    expect(iconButtonSource).toContain(
      "let showsHoverChrome = isEnabled && (hovering || isHighlighted)",
    );
    expect(iconButtonSource).toContain("isHighlighted ? 0.42 : 0.34");
    expect(iconButtonSource).toContain("layer?.borderWidth =");
    expect(iconButtonSource).toContain(
      "layer?.borderColor = MenuBarStyle.controlHoverBorder.cgColor",
    );
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
      "controlsView.frame = NSRect(x: 0, y: 111, width: bounds.width, height: 52)",
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

  it("uses more available menu width for playback metadata", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(sources).toContain("static let contentInset: CGFloat = 18");
    expect(sources).toContain("static var currentTextX: CGFloat");
    expect(sources).toContain("static var currentTextWidth: CGFloat");
    expect(sources).toContain("static var fullWidthContentWidth: CGFloat");
    expect(sources).toContain("static var nextTrackTextX: CGFloat");
    expect(sources).toContain("static var nextTrackTextWidth: CGFloat");
    expect(nowPlayingViewSource).toContain(
      "titleTextView.frame = NSRect(x: MenuBarStyle.currentTextX, y: 4, width: MenuBarStyle.currentTextWidth, height: 24)",
    );
    expect(nowPlayingViewSource).toContain(
      "albumTextView.frame = NSRect(x: MenuBarStyle.currentTextX, y: 30, width: MenuBarStyle.currentTextWidth, height: 18)",
    );
    expect(nowPlayingViewSource).toContain(
      "seekBarView.frame = NSRect(x: MenuBarStyle.contentInset, y: 80, width: MenuBarStyle.fullWidthContentWidth, height: 9)",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackTitleTextView.frame = NSRect(x: MenuBarStyle.nextTrackTextX, y: 206, width: MenuBarStyle.nextTrackTextWidth, height: 18)",
    );
    expect(nowPlayingViewSource).not.toContain(
      "titleTextView.frame = NSRect(x: 104",
    );
    expect(nowPlayingViewSource).not.toContain(
      "seekBarView.frame = NSRect(x: 24",
    );
    expect(nowPlayingViewSource).not.toContain("width: 190");
  });

  it("balances top and bottom padding in the menu bar playback view", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      "NSSize(width: MenuBarStyle.width, height: 252)",
    );
    expect(nowPlayingViewSource).toContain(
      "titleTextView.frame = NSRect(x: MenuBarStyle.currentTextX, y: 4, width: MenuBarStyle.currentTextWidth, height: 24)",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackDetailTextView.frame = NSRect(x: MenuBarStyle.nextTrackTextX, y: 225, width: MenuBarStyle.nextTrackTextWidth, height: 16)",
    );
  });

  it("balances top and bottom padding within the Up Next section", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const nowPlayingViewSource = sources.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain(
      "nextTrackLabel.frame = NSRect(x: MenuBarStyle.contentInset, y: 179, width: MenuBarStyle.fullWidthContentWidth, height: 14)",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackArtworkView.frame = NSRect(x: MenuBarStyle.contentInset, y: 205, width: MenuBarStyle.nextTrackArtworkSize, height: MenuBarStyle.nextTrackArtworkSize)",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackTitleTextView.frame = NSRect(x: MenuBarStyle.nextTrackTextX, y: 206, width: MenuBarStyle.nextTrackTextWidth, height: 18)",
    );
    expect(nowPlayingViewSource).toContain(
      "nextTrackDetailTextView.frame = NSRect(x: MenuBarStyle.nextTrackTextX, y: 225, width: MenuBarStyle.nextTrackTextWidth, height: 16)",
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

  it("aligns footer menu actions with the playback content inset", () => {
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );

    expect(controllerSource).toContain("focusItem.indentationLevel = 0");
    expect(controllerSource).toContain("quitItem.indentationLevel = 0");
    expect(controllerSource).toContain("menu.addItem(focusItem)");
    expect(controllerSource).toContain("menu.addItem(quitItem)");
  });

  it("adds shortcuts and icons to footer menu actions", () => {
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );

    expect(controllerSource).toContain('keyEquivalent: "f"');
    expect(controllerSource).toContain(
      "focusItem.keyEquivalentModifierMask = [.command]",
    );
    expect(controllerSource).toContain(
      'menuItemIcon("arrow.up.forward.app", accessibilityDescription: "Focus YouTube Music")',
    );
    expect(controllerSource).toContain(
      'menuItemIcon("xmark.circle", accessibilityDescription: "Quit")',
    );
    expect(controllerSource).toContain("focusItem.image =");
    expect(controllerSource).toContain("quitItem.image =");
    expect(controllerSource).toContain("private static func menuItemIcon");
    expect(controllerSource).toContain("image?.isTemplate = true");
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
    expect(scrollingViewSource).toContain("func completeScrollLoop");
    expect(scrollingViewSource).toContain("scrollOffset = scrollDistance");
    expect(scrollingViewSource).toContain(
      "NSPoint(x: -scrollOffset + lastTextWidth + Self.scrollLoopGap",
    );
    expect(metadataScrollerSource).toBeDefined();
    expect(metadataScrollerSource).toContain("maximumScrollDistance");
    expect(metadataScrollerSource).toContain("scrollDistance");
    expect(metadataScrollerSource).toContain("completeScrollLoop()");
    expect(metadataScrollerSource).not.toContain("maximumOverflow");
  });

  it("does not visibly reset scrolling text while paused between loops", () => {
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const metadataScrollerSource = sources.match(
      /private final class MenuBarMetadataScroller[\s\S]+?final class MenuBarControlsView/,
    )?.[0];

    expect(metadataScrollerSource).toBeDefined();
    expect(metadataScrollerSource).toContain("scheduleNextScrollAfterLoop");
    expect(metadataScrollerSource).not.toContain("scheduleResetAfterScroll");
    expect(metadataScrollerSource).not.toContain(
      "self.setScrollProgress(0)\n      self.scheduleScroll",
    );
  });

  it("keeps the menu bar seek bar optimistic until seek state catches up", () => {
    const viewSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");
    const nowPlayingViewSource = viewSource.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarSeekBarView/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain("pendingSeekTime");
    expect(nowPlayingViewSource).toContain("pendingSeekExpirationDate");
    expect(nowPlayingViewSource).toContain("applyOptimisticSeek");
    expect(nowPlayingViewSource).toContain("displayProgress(for: state)");
    expect(nowPlayingViewSource).toContain(
      "abs(state.progress - pendingSeekTime)",
    );
    expect(nowPlayingViewSource).toContain("pendingSeekToleranceSeconds");
    expect(nowPlayingViewSource).toContain(
      "updateProgressDisplay(progress: displayProgress, duration: state.duration)",
    );
  });

  it("shows a hover tooltip with the target seek timestamp", () => {
    const viewSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");
    const seekBarSource = viewSource.match(
      /private final class MenuBarSeekBarView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];

    expect(seekBarSource).toBeDefined();
    expect(seekBarSource).toContain("private let seekTooltipLabel");
    expect(seekBarSource).toContain("func setDuration");
    expect(seekBarSource).toContain("override func mouseMoved");
    expect(seekBarSource).toContain("override func mouseExited");
    expect(seekBarSource).toContain("updateSeekTooltip(with: event)");
    expect(seekBarSource).toContain("hideSeekTooltip()");
    expect(seekBarSource).toContain("formatTime(Double(fraction) * duration)");
    expect(seekBarSource).toContain(".mouseMoved");
    expect(seekBarSource).toContain("seekTooltipLabel.isHidden = false");
    expect(seekBarSource).toContain(".enabledDuringMouseDrag");
    expect(seekBarSource).toContain(
      "override var wantsDefaultClipping: Bool { false }",
    );
    expect(seekBarSource).toContain("layer?.masksToBounds = false");
    expect(seekBarSource).toContain("isMouseInsideBounds(event)");
    expect(seekBarSource).toContain("hideSeekTooltip()");
    expect(seekBarSource).not.toContain("toolTip = time");
    expect(seekBarSource).not.toContain("toolTip = nil");
  });

  it("routes menu mouse movement to playback control and seek hover surfaces", () => {
    const viewSource = read("Sources/YTMMenuBarConnector/MenuBarViews.swift");
    const nowPlayingViewSource = viewSource.match(
      /final class MenuBarNowPlayingView:[\s\S]+?private final class MenuBarSeekBarView/,
    )?.[0];
    const seekBarSource = viewSource.match(
      /private final class MenuBarSeekBarView:[\s\S]+?private final class MenuBarScrollingTextView/,
    )?.[0];
    const controlsViewSource = viewSource.match(
      /final class MenuBarControlsView:[\s\S]+?private final class MenuBarArtworkView/,
    )?.[0];
    const iconButtonSource = viewSource.match(
      /private final class MenuBarIconButton:[\s\S]+$/,
    )?.[0];

    expect(nowPlayingViewSource).toBeDefined();
    expect(nowPlayingViewSource).toContain("private var mouseEventMonitor");
    expect(nowPlayingViewSource).toContain("private var hoverPollTimer");
    expect(nowPlayingViewSource).toContain("override func viewDidMoveToWindow");
    expect(nowPlayingViewSource).toContain(
      "window?.acceptsMouseMovedEvents = true",
    );
    expect(nowPlayingViewSource).toContain("NSEvent.addLocalMonitorForEvents");
    expect(nowPlayingViewSource).toContain(".mouseMoved");
    expect(nowPlayingViewSource).toContain("updateHoverSurfaces(with: event)");
    expect(nowPlayingViewSource).toContain("startHoverPolling()");
    expect(nowPlayingViewSource).toContain("stopHoverPolling()");
    expect(nowPlayingViewSource).toContain(
      "window.mouseLocationOutsideOfEventStream",
    );
    expect(nowPlayingViewSource).toContain(
      "RunLoop.main.add(timer, forMode: .eventTracking)",
    );
    expect(nowPlayingViewSource).toContain(
      "updateHoverSurfaces(windowPoint: mousePoint)",
    );
    expect(nowPlayingViewSource).toContain("clearHoverSurfaces()");
    expect(nowPlayingViewSource).toContain(
      "controlsView.updateHover(from: event)",
    );
    expect(nowPlayingViewSource).toContain(
      "seekBarView.updateHover(from: event)",
    );
    expect(nowPlayingViewSource).toContain(
      "controlsView.updateHover(windowPoint: windowPoint)",
    );
    expect(nowPlayingViewSource).toContain(
      "seekBarView.updateHover(windowPoint: windowPoint)",
    );

    expect(seekBarSource).toBeDefined();
    expect(seekBarSource).toContain("func updateHover(from event: NSEvent)");
    expect(seekBarSource).toContain("func updateHover(windowPoint: NSPoint)");
    expect(seekBarSource).toContain("func clearHoverState()");

    expect(controlsViewSource).toBeDefined();
    expect(controlsViewSource).toContain(
      "func updateHover(from event: NSEvent)",
    );
    expect(controlsViewSource).toContain(
      "func updateHover(windowPoint: NSPoint)",
    );
    expect(controlsViewSource).toContain("func clearHoverState()");
    expect(controlsViewSource).toContain("shuffleButton.setHovering");
    expect(controlsViewSource).toContain("repeatButton.setHovering");

    expect(iconButtonSource).toBeDefined();
    expect(iconButtonSource).toContain("func setHovering");
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

  it("uses an outer ring while playback is active in the menu bar status item", () => {
    const manifest = read("Package.swift");
    const sourceFiles = listFiles("Sources/YTMMenuBarConnector");
    const sources = listFiles("Sources/YTMMenuBarConnector")
      .map(read)
      .join("\n");
    const statusIconSource = read(
      "Sources/YTMMenuBarConnector/MenuBarStatusIcon.swift",
    );
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );
    const idleIcon = read(
      "Sources/YTMMenuBarConnector/Resources/extension-icon-monochrome.svg",
    );
    const playingIcon = read(
      "Sources/YTMMenuBarConnector/Resources/extension-icon-monochrome-ring.svg",
    );

    expect(manifest).toContain(
      '.copy("Resources/extension-icon-monochrome-ring.svg")',
    );
    expect(sourceFiles).toContain(
      "Sources/YTMMenuBarConnector/Resources/extension-icon-monochrome-ring.svg",
    );
    expect(sourceFiles).not.toContain(
      "Sources/YTMMenuBarConnector/Resources/extension-icon-monochrome-spokeless.svg",
    );
    expect(statusIconSource).toContain("static func playingIcon");
    expect(statusIconSource).toContain("image.isTemplate = true");
    expect(statusIconSource).toContain(
      'forResource: "extension-icon-monochrome-ring"',
    );
    expect(controllerSource).toContain("private let playingStatusIcon");
    expect(controllerSource).toContain(
      "isPlaying ? playingStatusIcon : statusIcon",
    );
    expect(idleIcon).toContain("<line");
    expect(playingIcon).toContain("<line");
    expect(playingIcon).toContain("<circle");
    expect(statusIconSource).not.toContain("drawPlayingDot");
    expect(sources).not.toContain('"YTM>"');
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

  it("defines release metadata for direct and Homebrew channels", () => {
    const metadata = readJson<{
      appName: string;
      bundleIdentifier: string;
      version: string;
      buildNumber: string;
      minimumMacOSVersion: string;
      appcastUrl: string;
      nativeHostExecutablePath: string;
      channels: {
        direct: { sparkleEnabled: boolean };
        homebrew: { sparkleEnabled: boolean };
      };
    }>("release/metadata.json");

    expect(metadata.appName).toBe("YTM Menu Bar");
    expect(metadata.bundleIdentifier).toBe(
      "com.gormanity.ytm-enhancer.menu-bar",
    );
    expect(metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(metadata.buildNumber).toMatch(/^\d+$/);
    expect(metadata.minimumMacOSVersion).toBe("13.0");
    expect(metadata.appcastUrl).toBe(
      "https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml",
    );
    expect(metadata.nativeHostExecutablePath).toBe(
      "/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector",
    );
    expect(metadata.channels.direct.sparkleEnabled).toBe(true);
    expect(metadata.channels.homebrew.sparkleEnabled).toBe(false);
  });

  it("scaffolds Sparkle app updates for direct installs", () => {
    const packageManifest = read("Package.swift");
    const updaterSource = read(
      "Sources/YTMMenuBarConnector/SparkleUpdater.swift",
    );
    const mainSource = read("Sources/YTMMenuBarConnector/main.swift");
    const controllerSource = read(
      "Sources/YTMMenuBarConnector/MenuBarController.swift",
    );
    const plistTemplate = read("release/Info.plist.template");

    expect(packageManifest).toContain("sparkle-project/Sparkle");
    expect(packageManifest).toContain('.product(name: "Sparkle"');
    expect(updaterSource).toContain("SPUStandardUpdaterController");
    expect(updaterSource).toContain("DistributionChannel.current");
    expect(mainSource).toContain("SparkleUpdater");
    expect(controllerSource).toContain("Check for Updates");
    expect(controllerSource).toContain("Update with Homebrew");
    expect(plistTemplate).toContain("SUFeedURL");
    expect(plistTemplate).toContain("SUPublicEDKey");
    expect(plistTemplate).toContain("LSUIElement");
  });

  it("generates production native host manifests for app bundle installs", () => {
    const generator = read("scripts/generate-native-host-manifests.mjs");

    expect(generator).toContain(NATIVE_MESSAGING_HOST_NAME);
    expect(generator).toContain(
      "/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector",
    );
    expect(generator).toContain("bilcedjabgiedoamakekncokccabdccp");
    expect(generator).toContain("ytm-enhancer@gormanity");
    expect(generator).not.toContain("pggblbpjleekkobiinobaeeefnimgljh");
    expect(generator).not.toContain("akkbieodbakphpfdibailajdknnmmoca");
    expect(generator).not.toContain("Microsoft Edge");
  });

  it("defines release scripts for app, package, appcast, and Homebrew cask", () => {
    const sourceFiles = listFiles(".");

    expect(sourceFiles).toContain("scripts/build-release-app.mjs");
    expect(sourceFiles).toContain("scripts/package-release.mjs");
    expect(sourceFiles).toContain("scripts/generate-appcast.mjs");
    expect(sourceFiles).toContain("scripts/generate-homebrew-cask.mjs");

    const appScript = read("scripts/build-release-app.mjs");
    const packageScript = read("scripts/package-release.mjs");
    const appcastScript = read("scripts/generate-appcast.mjs");

    expect(appScript).toContain("direct");
    expect(appScript).toContain("homebrew");
    expect(appScript).toContain("Info.plist.template");
    expect(appScript).toContain("Sparkle.framework");
    expect(appScript).toContain("verbatimSymlinks: true");
    expect(appScript).toContain('process.env.DEVELOPER_ID_APPLICATION ?? "-"');
    expect(appScript).toContain('identity === "-"');
    expect(packageScript).toContain("pkgbuild");
    expect(packageScript).toContain("productbuild");
    expect(appcastScript).toContain("sparkle:edSignature");
    expect(appcastScript).toContain("menu-bar/appcast.xml");
  });

  it("ships initial menu bar releases without Apple notarization", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/menu-bar-release.yml"),
      "utf-8",
    );
    const releaseDocs = readFileSync(
      resolve(process.cwd(), "docs/menu-bar-release.md"),
      "utf-8",
    );

    expect(workflow).not.toContain("notarytool");
    expect(workflow).not.toContain("stapler staple");
    expect(workflow).not.toContain("CERTIFICATE_PASSWORD");
    expect(workflow).not.toContain("DEVELOPER_ID_APPLICATION_P12_BASE64");
    expect(workflow).not.toContain("DEVELOPER_ID_INSTALLER_P12_BASE64");
    expect(workflow).not.toContain("APP_STORE_CONNECT_PRIVATE_KEY_BASE64");
    expect(releaseDocs).toContain("not notarized");
    expect(releaseDocs).toContain("ad-hoc signed");
  });

  it("signs Sparkle appcasts from the decoded CI key file", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/menu-bar-release.yml"),
      "utf-8",
    );

    expect(workflow).toContain("SPARKLE_PRIVATE_ED_KEY_BASE64");
    expect(workflow).toContain("--ed-key-file sparkle_ed_private_key");
    expect(workflow).toContain("sparkle:edSignature");
    expect(workflow).not.toContain("generate_keys");
  });

  it("updates the Homebrew tap through a repository deploy key", () => {
    const workflow = readFileSync(
      resolve(process.cwd(), ".github/workflows/menu-bar-release.yml"),
      "utf-8",
    );
    const releaseDocs = readFileSync(
      resolve(process.cwd(), "docs/menu-bar-release.md"),
      "utf-8",
    );

    expect(workflow).toContain("repository: gormanity/homebrew-tap");
    expect(workflow).toContain(
      "ssh-key: ${{ secrets.HOMEBREW_TAP_DEPLOY_KEY }}",
    );
    expect(workflow).not.toContain("HOMEBREW_TAP_TOKEN");
    expect(releaseDocs).toContain("HOMEBREW_TAP_DEPLOY_KEY");
    expect(releaseDocs).not.toContain("HOMEBREW_TAP_TOKEN");
  });

  it("defines a Homebrew cask template where Brew owns updates", () => {
    const template = read("release/homebrew/ytm-menu-bar.rb.template");

    expect(template).toContain('cask "ytm-menu-bar" do');
    expect(template).toContain("menu-bar-v#{version}");
    expect(template).toContain("YTM-Menu-Bar-Homebrew-#{version}.pkg");
    expect(template).toContain('sha256 "{{SHA256}}"');
    expect(template).toContain('depends_on macos: ">= :ventura"');
    expect(template).toContain('pkg "YTM-Menu-Bar-Homebrew-#{version}.pkg"');
    expect(template).toContain("pkgutil:");
    expect(template).toContain("brew upgrade --cask ytm-menu-bar");
    expect(template).not.toContain("auto_updates true");
    expect(template).not.toContain("sha256 :no_check");
  });
});
