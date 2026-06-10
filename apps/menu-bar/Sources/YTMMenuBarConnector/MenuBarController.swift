import AppKit
import Foundation

final class MenuBarController: NSObject {
  var onShuffle: (() -> Void)?
  var onPrevious: (() -> Void)?
  var onTogglePlay: (() -> Void)?
  var onNext: (() -> Void)?
  var onRepeat: (() -> Void)?
  var onRefresh: (() -> Void)?

  private let barItem = NSStatusBar.system.statusItem(
    withLength: NSStatusItem.variableLength
  )
  private let statusIcon =
    MenuBarStatusIcon.monochromeIcon() ?? MenuBarStatusIcon.extensionIcon()
  private let menu = NSMenu()
  private let nowPlayingView = MenuBarNowPlayingView()
  private let nowPlayingItem = NSMenuItem()
  private let refreshItem = NSMenuItem(title: "Refresh", action: #selector(refresh), keyEquivalent: "")
  private let quitItem = NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q")

  override init() {
    super.init()
    configureMenu()
    updateConnectionStatus("Connecting")
  }

  func updateConnectionStatus(_ status: String) {
    updateStatusBar(isPlaying: false)
    nowPlayingView.updateConnectionStatus(status)
  }

  func updatePlayback(_ state: PlaybackState) {
    updateStatusBar(isPlaying: state.isPlaying)
    nowPlayingView.updatePlayback(state)
  }

  private func configureMenu() {
    refreshItem.target = self
    quitItem.target = self
    refreshItem.image = NSImage(
      systemSymbolName: "arrow.clockwise",
      accessibilityDescription: "Refresh"
    )

    nowPlayingItem.view = nowPlayingView
    nowPlayingView.setControlActions(
      onShuffle: { [weak self] in self?.shuffle() },
      onPrevious: { [weak self] in self?.previous() },
      onTogglePlay: { [weak self] in self?.togglePlay() },
      onNext: { [weak self] in self?.next() },
      onRepeat: { [weak self] in self?.repeatMode() }
    )

    menu.appearance = NSAppearance(named: .darkAqua)
    menu.addItem(nowPlayingItem)
    menu.addItem(.separator())
    menu.addItem(refreshItem)
    menu.addItem(quitItem)
    barItem.menu = menu
  }

  private func updateStatusBar(isPlaying: Bool) {
    barItem.length = NSStatusItem.squareLength
    barItem.button?.title = ""
    barItem.button?.image = statusIcon ?? MenuBarStatusIcon.fallbackIcon(isPlaying: isPlaying)
    barItem.button?.imagePosition = .imageOnly
    barItem.button?.imageScaling = .scaleProportionallyDown
    barItem.button?.toolTip = "YTM Enhancer"
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

  @objc private func refresh() {
    onRefresh?()
  }

  @objc private func quit() {
    NSApplication.shared.terminate(nil)
  }
}
