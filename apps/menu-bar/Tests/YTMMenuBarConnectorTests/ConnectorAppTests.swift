@testable import YTMMenuBarConnector
import AppKit
import XCTest

final class ConnectorAppTests: XCTestCase {
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
