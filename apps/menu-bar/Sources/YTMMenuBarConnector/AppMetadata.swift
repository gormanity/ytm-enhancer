import Foundation

enum AppMetadata {
  static let appName = "YTM Menu Bar"
  static let bundleIdentifier = "com.gormanity.ytm-enhancer.menu-bar"
  static let version = "0.1.0"
  static let buildNumber = "1"
  static let minimumMacOSVersion = "13.0"
  static let appcastUrl =
    "https://gormanity.github.io/ytm-enhancer/menu-bar/appcast.xml"
  static let nativeHostExecutablePath =
    "/Applications/YTM Menu Bar.app/Contents/MacOS/YTMMenuBarConnector"
  static let directUninstallerPath =
    "/Applications/YTM Menu Bar Uninstaller.command"
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
