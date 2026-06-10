import AppKit
import Foundation

enum MenuBarStatusIcon {
  static func extensionIcon() -> NSImage? {
    guard
      let url = Bundle.module.url(forResource: "extension-icon", withExtension: "svg"),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = false
    return image
  }

  static func fallbackIcon(isPlaying _: Bool) -> NSImage? {
    NSImage(
      systemSymbolName: "music.note",
      accessibilityDescription: "YTM Enhancer"
    )
  }
}
