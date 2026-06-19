import Foundation

enum ConnectorProtocol {
  static let hostName = "com.gormanity.ytm_enhancer.menu_bar"
  static let connectorId = "com.gormanity.ytm-enhancer.menu-bar"
  static let connectorName = "YTM Menu Bar"
  static let connectorVersion = AppMetadata.version
  static let protocolVersion = "1.0.0"
  static let uninstallRequestedType = "connector.uninstallRequested"
  static let permissions = [
    "playback:read",
    "playback:control",
    "track:read",
    "ytm:focus",
  ]

  static func hello(requestId: String) -> [String: Any] {
    [
      "type": "connector.hello",
      "requestId": requestId,
      "manifest": [
        "id": connectorId,
        "name": connectorName,
        "version": connectorVersion,
        "protocolVersion": protocolVersion,
        "permissions": permissions,
      ],
    ]
  }

  static func subscribePlayback(requestId: String) -> [String: Any] {
    [
      "type": "connector.subscribe",
      "requestId": requestId,
      "events": ["playback.state"],
    ]
  }

  static func playbackStateRequest(requestId: String) -> [String: Any] {
    [
      "type": "playback.getState",
      "requestId": requestId,
    ]
  }

  static func playbackAction(_ action: String, requestId: String) -> [String: Any] {
    [
      "type": "playback.action",
      "requestId": requestId,
      "action": action,
    ]
  }

  static func playbackSeek(time: Double, requestId: String) -> [String: Any] {
    [
      "type": "playback.seek",
      "requestId": requestId,
      "time": time,
    ]
  }

  static func focusYouTubeMusic(requestId: String) -> [String: Any] {
    [
      "type": "ytm.focus",
      "requestId": requestId,
    ]
  }
}

struct TrackMetadata: Decodable {
  let title: String?
  let artist: String?
  let album: String?
  let year: Int?
  let artworkUrl: String?
}

struct PlaybackState: Decodable {
  let title: String?
  let artist: String?
  let album: String?
  let year: Int?
  let artworkUrl: String?
  let nextTrack: TrackMetadata?
  let isPlaying: Bool
  let progress: Double
  let duration: Double
  let isShuffling: Bool?
  let repeatMode: String?
}

struct HostMessage {
  let type: String
  let requestId: String?
  let state: PlaybackState?
  let code: String?
  let message: String?

  init?(json: [String: Any]) {
    guard let type = json["type"] as? String else { return nil }
    self.type = type
    self.requestId = json["requestId"] as? String
    self.code = json["code"] as? String
    self.message = json["message"] as? String

    if let stateObject = json["state"] {
      self.state = try? JSONDecoder().decode(
        PlaybackState.self,
        from: JSONSerialization.data(withJSONObject: stateObject)
      )
    } else {
      self.state = nil
    }
  }
}
