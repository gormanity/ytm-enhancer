import AppKit
import Foundation

final class MenuBarController: NSObject {
  var onShuffle: (() -> Void)?
  var onPrevious: (() -> Void)?
  var onTogglePlay: (() -> Void)?
  var onNext: (() -> Void)?
  var onRepeat: (() -> Void)?
  var onSeek: ((Double) -> Void)?
  var onFocusYouTubeMusic: (() -> Void)?
  var onCheckForUpdates: (() -> Void)?

  private let barItem = NSStatusBar.system.statusItem(
    withLength: NSStatusItem.variableLength
  )
  private let statusIcon: NSImage?
  private let playingStatusIcon: NSImage?
  private let menu = NSMenu()
  private let nowPlayingView = MenuBarNowPlayingView()
  private let nowPlayingItem = NSMenuItem()
  private let focusItem = NSMenuItem(
    title: "Focus YouTube Music",
    action: #selector(focusYouTubeMusic),
    keyEquivalent: "f"
  )
  private let updateItem = NSMenuItem(
    title: DistributionChannel.current == .homebrew
      ? "Update with Homebrew..."
      : "Check for Updates...",
    action: #selector(checkForUpdates),
    keyEquivalent: ""
  )
  private let quitItem = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")

  override init() {
    statusIcon = MenuBarStatusIcon.monochromeIcon() ?? MenuBarStatusIcon.extensionIcon()
    playingStatusIcon =
      MenuBarStatusIcon.playingIcon()
        ?? MenuBarStatusIcon.monochromeIcon()
        ?? statusIcon

    super.init()
    configureMenu()
    updateConnectionStatus("Connecting")
  }

  func updateConnectionStatus(_ status: String) {
    updateStatusBar(isPlaying: false)
    nowPlayingView.updateConnectionStatus(status)
  }

  func setStalePlaybackState() {
    nowPlayingView.setStalePlaybackState()
  }

  func updatePlayback(_ state: PlaybackState) {
    updateStatusBar(isPlaying: state.isPlaying)
    nowPlayingView.updatePlayback(state)
  }

  private func configureMenu() {
    focusItem.target = self
    focusItem.indentationLevel = 0
    focusItem.keyEquivalentModifierMask = [.command]
    focusItem.image = Self.menuItemIcon("arrow.up.forward.app", accessibilityDescription: "Focus YouTube Music")
    updateItem.target = self
    updateItem.indentationLevel = 0
    updateItem.image = Self.menuItemIcon("arrow.triangle.2.circlepath", accessibilityDescription: "Check for Updates")
    quitItem.target = self
    quitItem.indentationLevel = 0
    quitItem.image = Self.menuItemIcon("xmark.circle", accessibilityDescription: "Quit")

    nowPlayingItem.view = nowPlayingView
    nowPlayingView.setControlActions(
      onShuffle: { [weak self] in self?.shuffle() },
      onPrevious: { [weak self] in self?.previous() },
      onTogglePlay: { [weak self] in self?.togglePlay() },
      onNext: { [weak self] in self?.next() },
      onRepeat: { [weak self] in self?.repeatMode() },
      onSeek: { [weak self] time in self?.seek(time) }
    )

    menu.appearance = NSAppearance(named: .darkAqua)
    menu.addItem(nowPlayingItem)
    menu.addItem(.separator())
    menu.addItem(focusItem)
    menu.addItem(updateItem)
    menu.addItem(quitItem)
    barItem.menu = menu
  }

  private func updateStatusBar(isPlaying: Bool) {
    barItem.length = NSStatusItem.squareLength
    barItem.button?.title = ""
    barItem.button?.image =
      (isPlaying ? playingStatusIcon : statusIcon)
        ?? MenuBarStatusIcon.fallbackIcon(isPlaying: isPlaying)
    barItem.button?.imagePosition = .imageOnly
    barItem.button?.imageScaling = .scaleProportionallyDown
    barItem.button?.toolTip = "YTM Enhancer"
  }

  private static func menuItemIcon(
    _ symbolName: String,
    accessibilityDescription: String
  ) -> NSImage? {
    let image = NSImage(
      systemSymbolName: symbolName,
      accessibilityDescription: accessibilityDescription
    )
    image?.isTemplate = true
    return image
  }

  @objc private func shuffle() {
    onShuffle?()
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

  @objc private func repeatMode() {
    onRepeat?()
  }

  private func seek(_ time: Double) {
    onSeek?(time)
  }

  @objc private func focusYouTubeMusic() {
    onFocusYouTubeMusic?()
  }

  @objc private func checkForUpdates() {
    onCheckForUpdates?()
  }

  @objc private func quit() {
    NSApplication.shared.terminate(nil)
  }
}
