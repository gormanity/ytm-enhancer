import AppKit
import Foundation

private func runRelay(
  bridgeClient: MenuBarBridgeClient,
  logger: NativeAppLogger
) -> Never {
  let relay = NativeMessagingRelay(
    nativeConnection: NativeMessagingConnection(logger: logger),
    bridgeClient: bridgeClient,
    logger: logger
  )
  relay.start()
  NSApplication.shared.run()
  exit(0)
}

private func emitAppBusy(
  ownerName: String,
  logger: NativeAppLogger
) -> Never {
  let connection = NativeMessagingConnection(logger: logger)
  connection.sendImmediately(ConnectorProtocol.appBusy(ownerName: ownerName))
  exit(0)
}

private func connectToExistingBridge(
  ownerName: String,
  logger: NativeAppLogger,
  attempts: Int
) -> MenuBarBridgeConnectionResult {
  for attempt in 0..<attempts {
    let result = MenuBarBridgeClient.connectIfAvailable(
      ownerName: ownerName,
      logger: logger
    )
    if case .unavailable = result {
      if attempt + 1 < attempts {
        Thread.sleep(forTimeInterval: 0.1)
        continue
      }
    }
    return result
  }
  return .unavailable
}

private func runMenuBarUi(
  connection: ConnectorConnection,
  bridgeConnection: BridgeUiConnection? = nil,
  reservation: MenuBarBridgeServer? = nil,
  terminateWhenDisconnected: Bool = false,
  logger: NativeAppLogger
) -> Never {
  let updater = SparkleUpdater(logger: logger)
  let menu = MenuBarController()
  let aboutWindow = AboutWindowController()
  let connector = ConnectorApp(
    connection: connection,
    menu: menu,
    logger: logger
  )
  connector.onRequestUninstall = {
    aboutWindow.requestUninstall()
  }
  connector.onSourceChanged = { source in
    aboutWindow.updateBrowserSource(source)
    bridgeConnection?.updateActiveOwner(source)
    reservation?.updateActiveOwner(source?.displayName)
  }
  if terminateWhenDisconnected {
    connector.onDisconnected = {
      reservation?.stop()
      NSApplication.shared.terminate(nil)
    }
  }

  updater.onStatusChanged = { status in
    menu.setAboutUpdateAvailable(status.hasUpdateAvailable)
    aboutWindow.update(status: status)
  }
  menu.setAboutUpdateAvailable(updater.status.hasUpdateAvailable)
  menu.onShowAbout = {
    aboutWindow.show(
      status: updater.status,
      onShowUpdateInterface: { updater.showUpdateInterface() },
      onCheckUpdateAvailability: {
        updater.checkForUpdateAvailability(reason: "about")
      },
      onCopyHomebrewCommand: { updater.copyHomebrewUpdateCommand() }
    )
    updater.checkForUpdateAvailability(reason: "about-open")
  }
  updater.startBackgroundUpdateCheck()
  connector.start()
  if let bridgeConnection, !bridgeConnection.hasBridgeOwnership {
    logger.log("bridge UI startup lost ownership; terminating duplicate menu")
    exit(0)
  }
  if bridgeConnection != nil {
    menu.updateConnectionStatus("Waiting for YTM Enhancer")
  }
  NSApplication.shared.run()
  exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let logger = NativeAppLogger()
logger.log("starting YTM Menu Bar connector")

let hasNativeMessagingPipe = NativeMessagingLaunch.hasNativeMessagingPipe()

if !hasNativeMessagingPipe && NativeMessagingLaunch.hasExistingMenuBarInstance() {
  logger.log("existing menu bar instance detected; terminating direct launch")
  exit(0)
}

if hasNativeMessagingPipe {
  let ownerName = NativeMessagingLaunch.browserSourceHint()
  switch connectToExistingBridge(
    ownerName: ownerName,
    logger: logger,
    attempts: 1
  ) {
  case let .connected(bridgeClient):
    runRelay(bridgeClient: bridgeClient, logger: logger)
  case let .busy(activeOwnerName):
    emitAppBusy(ownerName: activeOwnerName, logger: logger)
  case .unavailable:
    break
  }

  let reservation = MenuBarBridgeServer(logger: logger)
  if reservation.reserve(ownerName: ownerName) {
    runMenuBarUi(
      connection: NativeMessagingConnection(logger: logger),
      reservation: reservation,
      terminateWhenDisconnected: true,
      logger: logger
    )
  }

  switch connectToExistingBridge(
    ownerName: ownerName,
    logger: logger,
    attempts: 20
  ) {
  case let .connected(bridgeClient):
    runRelay(bridgeClient: bridgeClient, logger: logger)
  case let .busy(activeOwnerName):
    emitAppBusy(ownerName: activeOwnerName, logger: logger)
  case .unavailable:
    emitAppBusy(ownerName: "another browser", logger: logger)
  }
}

let bridgeConnection = BridgeUiConnection(logger: logger)
runMenuBarUi(
  connection: bridgeConnection,
  bridgeConnection: bridgeConnection,
  logger: logger
)
