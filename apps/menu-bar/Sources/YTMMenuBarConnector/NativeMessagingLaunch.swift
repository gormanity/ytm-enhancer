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
}
