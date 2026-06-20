import Foundation

enum AppMetadata {
  static let appName = "YTM Menu Bar"
  static let bundleIdentifier = "com.gormanity.ytm-enhancer.menu-bar"
  static let baseVersion = "0.1.3"
  static let baseBuildNumber = "1003"
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

  static var version: String {
    if let displayVersion = bundledString("YTMMenuBarDisplayVersion") {
      return displayVersion
    }

    if let bundledVersion = bundledString("CFBundleShortVersionString") {
      return bundledVersion
    }

    return "\(localBuildVersion) (base v\(baseVersion))"
  }

  static var buildNumber: String {
    bundledString("CFBundleVersion") ?? localBuildNumber
  }

  static var versionText: String {
    if isBundledApp {
      return "Version \(version) (Build \(buildNumber))"
    }

    return "Version \(version)"
  }

  private static var isBundledApp: Bool {
    Bundle.main.bundleURL.pathExtension == "app"
  }

  private static var localBuildVersion: String {
    formatLocalBuildDate("yyyy.MM.dd.HHmm")
  }

  private static var localBuildNumber: String {
    formatLocalBuildDate("yyyyMMddHHmm")
  }

  private static func bundledString(_ key: String) -> String? {
    guard isBundledApp else { return nil }

    let value = Bundle.main.infoDictionary?[key] as? String
    let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmed?.isEmpty == false ? trimmed : nil
  }

  private static func formatLocalBuildDate(_ format: String) -> String {
    let formatter = DateFormatter()
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.timeZone = .current
    formatter.dateFormat = format
    return formatter.string(from: localBuildDate)
  }

  private static var localBuildDate: Date {
    guard
      let executablePath = Bundle.main.executableURL?.path
        ?? CommandLine.arguments.first
    else {
      return Date()
    }

    let attributes = try? FileManager.default.attributesOfItem(
      atPath: executablePath
    )
    return attributes?[.modificationDate] as? Date ?? Date()
  }
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
