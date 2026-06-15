import Foundation

enum MenuBarResources {
  private static let resourceBundleName =
    "YTMMenuBarConnector_YTMMenuBarConnector.bundle"

  static func url(forResource name: String, withExtension extensionName: String) -> URL? {
    for bundleURL in resourceBundleCandidates() {
      guard
        let bundle = Bundle(url: bundleURL),
        let url = bundle.url(forResource: name, withExtension: extensionName)
      else {
        continue
      }

      return url
    }

    return Bundle.main.url(forResource: name, withExtension: extensionName)
  }

  private static func resourceBundleCandidates() -> [URL] {
    [
      Bundle.main.resourceURL?.appendingPathComponent(resourceBundleName),
      Bundle.main.bundleURL.appendingPathComponent(resourceBundleName),
      Bundle.main.bundleURL
        .deletingLastPathComponent()
        .appendingPathComponent(resourceBundleName),
    ].compactMap { $0 }
  }
}
