import AppKit
import Foundation

final class MenuBarController: NSObject {
  var onPrevious: (() -> Void)?
  var onTogglePlay: (() -> Void)?
  var onNext: (() -> Void)?
  var onRefresh: (() -> Void)?

  private let barItem = NSStatusBar.system.statusItem(
    withLength: NSStatusItem.variableLength
  )
  private let menu = NSMenu()
  private let titleItem = NSMenuItem(title: "YTM Enhancer", action: nil, keyEquivalent: "")
  private let artistItem = NSMenuItem(title: "Waiting for playback", action: nil, keyEquivalent: "")
  private let progressItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  private let previousItem = NSMenuItem(title: "Previous", action: #selector(previous), keyEquivalent: "")
  private let playPauseItem = NSMenuItem(title: "Play/Pause", action: #selector(togglePlay), keyEquivalent: "")
  private let nextItem = NSMenuItem(title: "Next", action: #selector(next), keyEquivalent: "")
  private let refreshItem = NSMenuItem(title: "Refresh", action: #selector(refresh), keyEquivalent: "")
  private let quitItem = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")

  override init() {
    super.init()
    configureMenu()
    updateConnectionStatus("Connecting")
  }

  func updateConnectionStatus(_ status: String) {
    barItem.button?.title = "YTM"
    titleItem.title = "YTM Enhancer"
    artistItem.title = status
    progressItem.title = ""
  }

  func updatePlayback(_ state: PlaybackState) {
    let title = state.title?.isEmpty == false ? state.title! : "Unknown track"
    let artist = state.artist?.isEmpty == false ? state.artist! : "Unknown artist"

    barItem.button?.title = state.isPlaying ? "YTM >" : "YTM"
    titleItem.title = title
    artistItem.title = artist
    progressItem.title = formatProgress(state)
    playPauseItem.title = state.isPlaying ? "Pause" : "Play"
  }

  private func configureMenu() {
    titleItem.isEnabled = false
    artistItem.isEnabled = false
    progressItem.isEnabled = false

    previousItem.target = self
    playPauseItem.target = self
    nextItem.target = self
    refreshItem.target = self
    quitItem.target = self

    menu.addItem(titleItem)
    menu.addItem(artistItem)
    menu.addItem(progressItem)
    menu.addItem(.separator())
    menu.addItem(previousItem)
    menu.addItem(playPauseItem)
    menu.addItem(nextItem)
    menu.addItem(.separator())
    menu.addItem(refreshItem)
    menu.addItem(quitItem)
    barItem.menu = menu
  }

  private func formatProgress(_ state: PlaybackState) -> String {
    guard state.duration > 0 else { return "" }
    return "\(formatTime(state.progress)) / \(formatTime(state.duration))"
  }

  private func formatTime(_ value: Double) -> String {
    let seconds = max(0, Int(value.rounded()))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  @objc private func previous() {
    onPrevious?()
  }

  @objc private func togglePlay() {
    onTogglePlay?()
  }

  @objc private func next() {
    onNext?()
  }

  @objc private func refresh() {
    onRefresh?()
  }

  @objc private func quit() {
    NSApplication.shared.terminate(nil)
  }
}
