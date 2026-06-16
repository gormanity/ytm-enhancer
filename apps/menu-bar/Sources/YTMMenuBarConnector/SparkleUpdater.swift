import AppKit
import Foundation
import Sparkle

enum MenuBarUpdateStatus: Equatable {
  case homebrew
  case unavailable(String)
  case idle
  case checking
  case upToDate
  case updateAvailable(version: String)
  case failed(String)

  var hasUpdateAvailable: Bool {
    if case .updateAvailable = self {
      return true
    }
    return false
  }
}

final class SparkleUpdater {
  static let homebrewUpdateCommand =
    "brew update && brew upgrade --cask ytm-menu-bar"
  static let homebrewUninstallCommand = "brew uninstall --cask ytm-menu-bar"

  var onStatusChanged: ((MenuBarUpdateStatus) -> Void)?

  private var updaterController: SPUStandardUpdaterController?
  private var updaterDelegate: SparkleUpdaterDelegate?
  private let unavailableReason: String?
  private let logger: NativeAppLogger
  private(set) var status: MenuBarUpdateStatus

  init(logger: NativeAppLogger = NativeAppLogger()) {
    self.logger = logger

    if DistributionChannel.current == .homebrew {
      updaterController = nil
      updaterDelegate = nil
      unavailableReason = nil
      status = .homebrew
      logger.log("sparkle updater disabled for homebrew channel")
      return
    }

    if let configurationIssue = Self.configurationIssue() {
      updaterController = nil
      updaterDelegate = nil
      unavailableReason = configurationIssue
      status = .unavailable(configurationIssue)
      logger.log("sparkle updater unavailable reason=\(configurationIssue)")
      return
    }

    let delegate = SparkleUpdaterDelegate(logger: logger)
    updaterDelegate = delegate
    unavailableReason = nil
    status = .idle

    delegate.onUpdateAvailable = { [weak self] item in
      self?.setStatus(.updateAvailable(version: item.displayVersionString))
    }
    delegate.onNoUpdateAvailable = { [weak self] in
      self?.setStatus(.upToDate)
    }
    delegate.onUpdateError = { [weak self] error in
      self?.setStatus(.failed(error.localizedDescription))
    }

    let controller = SPUStandardUpdaterController(
      startingUpdater: true,
      updaterDelegate: delegate,
      userDriverDelegate: nil
    )
    updaterController = controller
    logger.log(
      "sparkle updater initialized canCheck=\(controller.updater.canCheckForUpdates)"
    )
  }

  func startBackgroundUpdateCheck() {
    guard updaterController != nil else { return }

    DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
      self?.checkForUpdateAvailability(reason: "background")
    }
  }

  func checkForUpdateAvailability(reason: String) {
    logger.log("checking update availability reason=\(reason)")

    guard let updater = updaterController?.updater else {
      if let unavailableReason {
        setStatus(.unavailable(unavailableReason))
      } else if DistributionChannel.current == .homebrew {
        setStatus(.homebrew)
      }
      return
    }

    if updater.sessionInProgress {
      logger.log("skipping update probe; sparkle session is already in progress")
      return
    }

    setStatus(.checking)
    updater.checkForUpdateInformation()
  }

  func showUpdateInterface() {
    logger.log("show update interface selected channel=\(DistributionChannel.current.rawValue)")

    switch DistributionChannel.current {
    case .direct:
      guard let updaterController else {
        showUpdatesUnavailable()
        return
      }

      if !updaterController.updater.canCheckForUpdates {
        logger.log("sparkle updater cannot show update interface")
      }
      updaterController.checkForUpdates(nil)
    case .homebrew:
      copyHomebrewUpdateCommand()
    }
  }

  func copyHomebrewUpdateCommand() {
    NSPasteboard.general.clearContents()
    NSPasteboard.general.setString(Self.homebrewUpdateCommand, forType: .string)
    logger.log("copied homebrew update command")
  }

  private func setStatus(_ newStatus: MenuBarUpdateStatus) {
    status = newStatus
    onStatusChanged?(newStatus)
  }

  private func showUpdatesUnavailable() {
    let alert = NSAlert()
    alert.messageText = "Updates Unavailable"
    alert.informativeText =
      "This build cannot check for updates. \(unavailableReason ?? "Install the latest release package to use app updates.")"
    alert.addButton(withTitle: "OK")
    alert.runModal()
  }

  private static var isBundledApp: Bool {
    Bundle.main.bundleURL.pathExtension == "app"
  }

  private static func configurationIssue() -> String? {
    if !isBundledApp {
      return "The app is not running from a bundled macOS app."
    }

    guard
      let publicKey = Bundle.main.object(
        forInfoDictionaryKey: "SUPublicEDKey"
      ) as? String
    else {
      return "The Sparkle public key is missing."
    }

    let trimmedPublicKey = publicKey.trimmingCharacters(
      in: .whitespacesAndNewlines
    )
    if trimmedPublicKey.isEmpty
      || trimmedPublicKey == "__SPARKLE_PUBLIC_ED_KEY__"
    {
      return "This local build does not include a Sparkle public key."
    }

    guard Data(base64Encoded: trimmedPublicKey)?.count == 32 else {
      return "The Sparkle public key is invalid."
    }

    guard
      let appcastUrl = Bundle.main.object(
        forInfoDictionaryKey: "SUFeedURL"
      ) as? String,
      URL(string: appcastUrl) != nil
    else {
      return "The Sparkle appcast URL is missing or invalid."
    }

    return nil
  }
}

private final class SparkleUpdaterDelegate: NSObject, SPUUpdaterDelegate {
  var onUpdateAvailable: ((SUAppcastItem) -> Void)?
  var onNoUpdateAvailable: (() -> Void)?
  var onUpdateError: ((Error) -> Void)?

  private let logger: NativeAppLogger

  init(logger: NativeAppLogger) {
    self.logger = logger
  }

  func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
    logger.log(
      "sparkle update available version=\(item.displayVersionString)"
    )
    onUpdateAvailable?(item)
  }

  func updaterDidNotFindUpdate(_ updater: SPUUpdater) {
    logger.log("sparkle update probe found no update")
    onNoUpdateAvailable?()
  }

  func updaterDidNotFindUpdate(_ updater: SPUUpdater, error: Error) {
    logger.log("sparkle update probe found no update reason=\(error.localizedDescription)")
    onNoUpdateAvailable?()
  }

  func updater(_ updater: SPUUpdater, didAbortWithError error: Error) {
    if Self.isNoUpdateError(error) {
      logger.log("sparkle update probe aborted after finding no update")
      onNoUpdateAvailable?()
      return
    }

    logger.log("sparkle update check failed error=\(error.localizedDescription)")
    onUpdateError?(error)
  }

  func updater(
    _ updater: SPUUpdater,
    didFinishUpdateCycleFor updateCheck: SPUUpdateCheck,
    error: Error?
  ) {
    guard let error else { return }

    logger.log(
      "sparkle update cycle finished with error check=\(updateCheck.rawValue) error=\(error.localizedDescription)"
    )
  }

  private static func isNoUpdateError(_ error: Error) -> Bool {
    let nsError = error as NSError
    // Sparkle's SUNoUpdateError enum value is exported to Objective-C but not
    // to this Swift module interface.
    return nsError.domain == SUSparkleErrorDomain
      && nsError.code == 1001
  }
}
