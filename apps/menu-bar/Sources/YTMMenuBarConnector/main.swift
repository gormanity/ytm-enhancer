import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let logger = NativeAppLogger()
logger.log("starting YTM Menu Bar connector")

let hasNativeMessagingPipe = NativeMessagingLaunch.hasNativeMessagingPipe()

if !hasNativeMessagingPipe && NativeMessagingLaunch.hasExistingMenuBarInstance() {
  logger.log("existing menu bar instance detected; terminating direct launch")
  exit(0)
}

if hasNativeMessagingPipe,
  let bridgeClient = MenuBarBridgeClient.connectIfAvailable(logger: logger)
{
  let relay = NativeMessagingRelay(
    nativeConnection: NativeMessagingConnection(logger: logger),
    bridgeClient: bridgeClient,
    logger: logger
  )
  relay.start()
  app.run()
  exit(0)
}

let connection: ConnectorConnection =
  hasNativeMessagingPipe
  ? NativeMessagingConnection(logger: logger)
  : BridgeUiConnection(logger: logger)
let updater = SparkleUpdater(logger: logger)
let menu = MenuBarController()
let aboutWindow = AboutWindowController()
let connector = ConnectorApp(connection: connection, menu: menu, logger: logger)
connector.onRequestUninstall = {
  aboutWindow.requestUninstall()
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
if !hasNativeMessagingPipe {
  menu.updateConnectionStatus("Waiting for YTM Enhancer")
}
app.run()
