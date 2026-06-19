import Foundation

enum AppMetadata {
  static let appName = "YTM Menu Bar"
  static let bundleIdentifier = "com.gormanity.ytm-enhancer.menu-bar"
  static let version = "0.1.2"
  static let buildNumber = "1002"
  static let minimumMacOSVersion = "13.0"
  static let appcastUrl =
    "https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml"
  static let nativeHostExecutablePath =
    "/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector"
  static let directUninstallerPath =
    "/Applications/YTM Menu Bar Uninstaller.command"
  static let executableName = "YTMMenuBarConnector"
  static let nativeHostName = "com.gormanity.ytm_enhancer.menu_bar"
  static let appPackageReceiptIdentifier =
    "com.gormanity.ytm-enhancer.menu-bar.app"
  static let nativeHostsPackageReceiptIdentifier =
    "com.gormanity.ytm-enhancer.menu-bar.native-hosts"
  static let productionNativeHostManifestPaths = [
    "/Library/Google/Chrome/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
    "/Library/Application Support/Chromium/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
    "/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
    "/Library/Application Support/Mozilla/NativeMessagingHosts/com.gormanity.ytm_enhancer.menu_bar.json",
  ]
}

enum DistributionChannel: String {
  case direct
  case homebrew

  static var current: DistributionChannel {
    #if YTM_MENU_BAR_HOMEBREW
      return .homebrew
    #else
      return .direct
    #endif
  }
}
