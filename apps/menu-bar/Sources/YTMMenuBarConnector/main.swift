import AppKit
import Foundation

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let connection = NativeMessagingConnection()
let menu = MenuBarController()
let connector = ConnectorApp(connection: connection, menu: menu)

connector.start()
app.run()
