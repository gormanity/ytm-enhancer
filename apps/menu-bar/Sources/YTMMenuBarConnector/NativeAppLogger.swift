import Foundation

final class NativeAppLogger {
  static let defaultLogPath = "/tmp/ytm-menu-bar-connector.log"

  private let fileURL: URL
  private let queue = DispatchQueue(label: "ytm-enhancer.menu-bar.log")
  private let timestampFormatter = ISO8601DateFormatter()

  init(environment: [String: String] = ProcessInfo.processInfo.environment) {
    let configuredPath = environment["YTM_MENU_BAR_LOG_PATH"]
    let logPath: String
    if let configuredPath, !configuredPath.isEmpty {
      logPath = configuredPath
    } else {
      logPath = Self.defaultLogPath
    }
    fileURL = URL(fileURLWithPath: logPath)
  }

  var path: String {
    fileURL.path
  }

  func log(_ message: String) {
    let timestamp = timestampFormatter.string(from: Date())
    let line = "[\(timestamp)] \(singleLine(message))\n"

    queue.sync { [fileURL] in
      try? FileManager.default.createDirectory(
        at: fileURL.deletingLastPathComponent(),
        withIntermediateDirectories: true
      )

      guard let data = line.data(using: .utf8) else { return }
      if FileManager.default.fileExists(atPath: fileURL.path) {
        guard let handle = try? FileHandle(forWritingTo: fileURL) else {
          return
        }
        handle.seekToEndOfFile()
        handle.write(data)
        handle.closeFile()
      } else {
        _ = FileManager.default.createFile(
          atPath: fileURL.path,
          contents: data
        )
      }
    }
  }

  private func singleLine(_ message: String) -> String {
    message
      .replacingOccurrences(of: "\n", with: " ")
      .replacingOccurrences(of: "\r", with: " ")
  }
}
