import AppKit
import Foundation

enum MenuBarStatusIcon {
  static func monochromeIcon() -> NSImage? {
    guard
      let url = MenuBarResources.url(
        forResource: "extension-icon-monochrome",
        withExtension: "svg"
      ),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = true
    return image
  }

  static func playingIcon() -> NSImage? {
    guard
      let url = MenuBarResources.url(
        forResource: "extension-icon-monochrome-ring",
        withExtension: "svg"
      ),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = true
    return image
  }

  static func extensionIcon() -> NSImage? {
    guard
      let url = MenuBarResources.url(
        forResource: "extension-icon",
        withExtension: "svg"
      ),
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
