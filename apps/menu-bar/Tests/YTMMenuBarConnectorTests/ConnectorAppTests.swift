@testable import YTMMenuBarConnector
import AppKit
import XCTest

final class ConnectorAppTests: XCTestCase {
  func testMenuActionReflectsYouTubeMusicTabAvailability() {
    _ = NSApplication.shared
    let menu = MenuBarController()

    XCTAssertEqual("Open YouTube Music", menu.youtubeMusicActionTitle)

    menu.setYouTubeMusicTabAvailable(false)
    XCTAssertEqual("Open YouTube Music", menu.youtubeMusicActionTitle)

    menu.setYouTubeMusicTabAvailable(true)
    XCTAssertEqual("Focus YouTube Music", menu.youtubeMusicActionTitle)
  }

  func testDisconnectedMenuActionOpensYouTubeMusic() {
    _ = NSApplication.shared
    let connection = FakeConnectorConnection()
    let menu = MenuBarController()
    var openCount = 0
    let app = ConnectorApp(
      connection: connection,
      menu: menu,
      openYouTubeMusic: { openCount += 1 }
    )

    app.start()
    menu.onFocusYouTubeMusic?()

    XCTAssertEqual(1, openCount)
    XCTAssertEqual(["connector.hello"], connection.sentMessageTypes)
  }

  func testMissingTabFocusErrorFallsBackToOpeningYouTubeMusic() {
    _ = NSApplication.shared
    let connection = FakeConnectorConnection()
    let menu = MenuBarController()
    var openCount = 0
    let app = ConnectorApp(
      connection: connection,
      menu: menu,
      openYouTubeMusic: { openCount += 1 }
    )

    app.start()
    connection.emit([
      "type": "connector.ready",
      "requestId": "hello-1",
    ])
    menu.onFocusYouTubeMusic?()
    connection.emit([
      "type": "connector.error",
      "requestId": "focus-5",
      "code": "route_failed",
      "message": "No active YouTube Music tab",
    ])

    XCTAssertEqual("ytm.focus", connection.sentMessageTypes.last)
    XCTAssertEqual(1, openCount)
  }

  func testOlderExtensionStatusRejectionIsIgnored() throws {
    _ = NSApplication.shared
    let connection = FakeConnectorConnection()
    let menu = MenuBarController()
    let logPath = FileManager.default.temporaryDirectory
      .appendingPathComponent("ytm-menu-bar-status-\(UUID().uuidString).log")
      .path
    defer {
      try? FileManager.default.removeItem(atPath: logPath)
    }
    let app = ConnectorApp(
      connection: connection,
      menu: menu,
      logger: NativeAppLogger(
        environment: ["YTM_MENU_BAR_LOG_PATH": logPath]
      )
    )

    app.start()
    connection.emit([
      "type": "connector.ready",
      "requestId": "hello-1",
    ])
    connection.emit([
      "type": "connector.error",
      "requestId": "ytm-status-3",
      "code": "invalid_message",
      "message": "Invalid connector message: unsupported type ytm.getStatus",
    ])

    let log = try String(contentsOfFile: logPath, encoding: .utf8)
    XCTAssertTrue(
      log.contains("ignoring unsupported YouTube Music status request")
    )
  }

  func testHostMessageDecodesYouTubeMusicTabStatus() {
    let message = HostMessage(
      json: [
        "type": "ytm.status",
        "status": [
          "hasTabs": false,
          "tabCount": 0,
          "selectedTabKnown": false,
        ],
      ]
    )

    XCTAssertEqual(false, message?.status?.hasTabs)
    XCTAssertEqual(0, message?.status?.tabCount)
    XCTAssertEqual(false, message?.status?.selectedTabKnown)
  }

  func testBrowserSourceHintRecognizesLocalChromeDevExtension() {
    XCTAssertEqual(
      "Chrome",
      NativeMessagingLaunch.browserSourceHint(
        arguments: [
          "YTMMenuBarConnector",
          "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/",
        ],
        parentProcessIdentifier: -1
      )
    )
  }

  func testSamePlaybackItemIgnoresOnlyProgressChanges() {
    let initial = playbackState(progress: 12)
    let advanced = playbackState(progress: 18)

    XCTAssertTrue(ConnectorApp.samePlaybackItem(initial, advanced))
  }

  func testSamePlaybackItemRejectsEveryUserVisibleFieldChange() {
    let initial = playbackState()
    let changedStates = [
      playbackState(title: "Other Song"),
      playbackState(artist: "Other Artist"),
      playbackState(album: "Other Album"),
      playbackState(year: 2027),
      playbackState(artworkUrl: "https://example.test/current-2.jpg"),
      playbackState(duration: 90),
      playbackState(isPlaying: false),
      playbackState(nextTrack: nil),
      playbackState(
        nextTrack: trackMetadata(title: "Other Next Song")
      ),
      playbackState(
        nextTrack: trackMetadata(artist: "Other Next Artist")
      ),
      playbackState(
        nextTrack: trackMetadata(album: "Other Next Album")
      ),
      playbackState(
        nextTrack: trackMetadata(year: 2028)
      ),
      playbackState(
        nextTrack: trackMetadata(
          artworkUrl: "https://example.test/next-2.jpg"
        )
      ),
      playbackState(isShuffling: true),
      playbackState(repeatMode: "one"),
    ]

    for changedState in changedStates {
      XCTAssertFalse(
        ConnectorApp.samePlaybackItem(initial, changedState),
        "Expected visible playback changes to bypass stale-state filtering"
      )
    }
  }

  func testOptimisticSeekDoesNotCarryIntoReplacementTrack() {
    _ = NSApplication.shared
    let view = MenuBarNowPlayingView()
    let initial = playbackState(
      artworkUrl: nil,
      nextTrack: nil,
      progress: 83,
      duration: 296
    )
    let replacement = playbackState(
      title: "Replacement Song",
      artworkUrl: nil,
      nextTrack: nil,
      progress: 5,
      duration: 240
    )

    view.updatePlayback(initial)
    view.applyOptimisticSeek(213)

    XCTAssertEqual(213, view.displayProgress(for: initial))
    XCTAssertEqual(5, view.displayProgress(for: replacement))
    XCTAssertEqual(83, view.displayProgress(for: initial))
  }

  private func playbackState(
    title: String? = "Song",
    artist: String? = "Artist",
    album: String? = "Album",
    year: Int? = 2026,
    artworkUrl: String? = "https://example.test/current.jpg",
    nextTrack: TrackMetadata? = TrackMetadata(
      title: "Next Song",
      artist: "Next Artist",
      album: "Next Album",
      year: 2027,
      artworkUrl: "https://example.test/next.jpg"
    ),
    isPlaying: Bool = true,
    progress: Double = 12,
    duration: Double = 60,
    isShuffling: Bool? = false,
    repeatMode: String? = "off"
  ) -> PlaybackState {
    PlaybackState(
      title: title,
      artist: artist,
      album: album,
      year: year,
      artworkUrl: artworkUrl,
      nextTrack: nextTrack,
      isPlaying: isPlaying,
      progress: progress,
      duration: duration,
      isShuffling: isShuffling,
      repeatMode: repeatMode
    )
  }

  private func trackMetadata(
    title: String? = "Next Song",
    artist: String? = "Next Artist",
    album: String? = "Next Album",
    year: Int? = 2027,
    artworkUrl: String? = "https://example.test/next.jpg"
  ) -> TrackMetadata {
    TrackMetadata(
      title: title,
      artist: artist,
      album: album,
      year: year,
      artworkUrl: artworkUrl
    )
  }
}

private final class FakeConnectorConnection: ConnectorConnection {
  private var onMessage: (([String: Any]) -> Void)?
  private(set) var sentMessageTypes: [String] = []

  func start(
    onMessage: @escaping ([String: Any]) -> Void,
    onDisconnect: @escaping () -> Void
  ) {
    self.onMessage = onMessage
  }

  func stop() {}

  func send(_ message: [String: Any]) {
    sentMessageTypes.append(message["type"] as? String ?? "")
  }

  func emit(_ message: [String: Any]) {
    onMessage?(message)
  }
}
