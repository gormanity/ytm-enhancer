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
  private let statusIcon = MenuBarStatusIcon.extensionIcon()
  private let menu = NSMenu()
  private let nowPlayingView = MenuBarNowPlayingView()
  private let controlsView = MenuBarControlsView()
  private let nowPlayingItem = NSMenuItem()
  private let controlsItem = NSMenuItem()
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
    controlsView.setPlaybackControlsEnabled(false)
  }

  func updatePlayback(_ state: PlaybackState) {
    updateStatusBar(isPlaying: state.isPlaying)
    nowPlayingView.updatePlayback(state)
    controlsView.updatePlayback(isPlaying: state.isPlaying)
    controlsView.setPlaybackControlsEnabled(true)
  }

  private func configureMenu() {
    refreshItem.target = self
    quitItem.target = self
    refreshItem.image = NSImage(
      systemSymbolName: "arrow.clockwise",
      accessibilityDescription: "Refresh"
    )

    nowPlayingItem.view = nowPlayingView
    controlsItem.view = controlsView
    controlsView.onPrevious = { [weak self] in self?.previous() }
    controlsView.onTogglePlay = { [weak self] in self?.togglePlay() }
    controlsView.onNext = { [weak self] in self?.next() }

    menu.appearance = NSAppearance(named: .darkAqua)
    menu.addItem(nowPlayingItem)
    menu.addItem(controlsItem)
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
