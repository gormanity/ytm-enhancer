import AppKit
import Darwin
import Foundation

enum NativeMessagingLaunch {
  static func hasNativeMessagingPipe(fileDescriptor: Int32 = STDIN_FILENO) -> Bool {
    var info = stat()
    guard fstat(fileDescriptor, &info) == 0 else { return false }

    let fileType = info.st_mode & S_IFMT
    return fileType == S_IFIFO || fileType == S_IFSOCK
  }

  static func hasExistingMenuBarInstance(
    bundleIdentifier: String = AppMetadata.bundleIdentifier,
    processIdentifier: pid_t = getpid()
  ) -> Bool {
    NSRunningApplication
      .runningApplications(withBundleIdentifier: bundleIdentifier)
      .contains { app in
        app.processIdentifier != processIdentifier && !app.isTerminated
      }
  }

  static func browserSourceHint(
    arguments: [String] = CommandLine.arguments,
    parentProcessIdentifier: pid_t = getppid()
  ) -> String {
    if let bundleIdentifier = NSRunningApplication(
      processIdentifier: parentProcessIdentifier
    )?.bundleIdentifier?.lowercased() {
      if bundleIdentifier.contains("edgemac") {
        return "Microsoft Edge"
      }
      if bundleIdentifier.contains("chromium") {
        return "Chromium"
      }
      if bundleIdentifier.contains("chrome") {
        return "Chrome"
      }
      if bundleIdentifier.contains("firefox") {
        return "Firefox"
      }
    }

    let launchValue = arguments.dropFirst().joined(separator: " ").lowercased()
    if launchValue.contains("gamefnibdabclmkngggcjghpbhjmajkm") {
      return "Microsoft Edge"
    }
    if launchValue.contains("ytm-enhancer@gormanity") {
      return "Firefox"
    }
    if launchValue.contains("bilcedjabgiedoamakekncokccabdccp")
      || launchValue.contains("pggblbpjleekkobiinobaeeefnimgljh")
      || launchValue.contains("akkbieodbakphpfdibailajdknnmmoca")
    {
      return "Chrome"
    }
    return "another browser"
  }
}
