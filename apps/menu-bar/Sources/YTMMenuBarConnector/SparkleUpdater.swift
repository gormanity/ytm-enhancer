import AppKit
import Foundation
import Sparkle

final class SparkleUpdater {
  private let updaterController: SPUStandardUpdaterController?

  init() {
    if DistributionChannel.current == .direct && Self.isBundledApp {
      updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
      )
    } else {
      updaterController = nil
    }
  }

  var menuTitle: String {
    switch DistributionChannel.current {
    case .direct:
      return "Check for Updates..."
    case .homebrew:
      return "Update with Homebrew..."
    }
  }

  var canCheckForUpdates: Bool {
    DistributionChannel.current == .direct
      && updaterController?.updater.canCheckForUpdates == true
  }

  func checkForUpdates() {
    switch DistributionChannel.current {
    case .direct:
      updaterController?.checkForUpdates(nil)
    case .homebrew:
      showHomebrewUpdateInstructions()
    }
  }

  private func showHomebrewUpdateInstructions() {
    let alert = NSAlert()
    alert.messageText = "Update with Homebrew"
    alert.informativeText =
      "Run brew update && brew upgrade --cask ytm-menu-bar to update YTM Menu Bar."
    alert.addButton(withTitle: "OK")
    alert.runModal()
  }

  private static var isBundledApp: Bool {
    Bundle.main.bundleURL.pathExtension == "app"
  }
}
