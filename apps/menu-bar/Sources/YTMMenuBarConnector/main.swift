import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let logger = NativeAppLogger()
logger.log("starting YTM Menu Bar connector")

let connection = NativeMessagingConnection(logger: logger)
let updater = SparkleUpdater()
let menu = MenuBarController()
let connector = ConnectorApp(connection: connection, menu: menu, logger: logger)

menu.onCheckForUpdates = {
  updater.checkForUpdates()
}
connector.start()
app.run()
