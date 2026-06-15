import AppKit

enum MenuBarControlIcon {
  case next
  case pause
  case play
  case previous
  case `repeat`
  case repeatOne
  case shuffle

  var resourceName: String {
    resource.resourceName
  }

  private struct Resource {
    let resourceName: String
  }

  private var resource: Resource {
    switch self {
    case .next:
      return Resource(resourceName: "playback-next")
    case .pause:
      return Resource(resourceName: "playback-pause")
    case .play:
      return Resource(resourceName: "playback-play")
    case .previous:
      return Resource(resourceName: "playback-previous")
    case .repeat:
      return Resource(resourceName: "playback-repeat")
    case .repeatOne:
      return Resource(resourceName: "playback-repeat-one")
    case .shuffle:
      return Resource(resourceName: "playback-shuffle")
    }
  }

  func image(accessibilityDescription: String?) -> NSImage? {
    guard
      let url = MenuBarResources.url(forResource: resourceName, withExtension: "svg"),
      let image = NSImage(contentsOf: url)
    else {
      return nil
    }

    image.isTemplate = true
    image.accessibilityDescription = accessibilityDescription
    return image
  }
}
