import AppKit
import Foundation

final class ConnectorApp {
  private static let playbackStateRetryDelaySeconds: TimeInterval = 2
  private static let playbackStateStaleTimeoutSeconds: TimeInterval = 8

  private let connection: NativeMessagingConnection
  private let menu: MenuBarController
  private let logger: NativeAppLogger
  private var nextRequestNumber = 0
  private var isReady = false
  private var playbackStateRetry: DispatchWorkItem?
  private var playbackStateStaleTimeout: DispatchWorkItem?

  init(
    connection: NativeMessagingConnection,
    menu: MenuBarController,
    logger: NativeAppLogger = NativeAppLogger()
  ) {
    self.connection = connection
    self.menu = menu
    self.logger = logger
  }

  func start() {
    menu.onShuffle = { [weak self] in self?.sendAction("shuffle") }
    menu.onPrevious = { [weak self] in self?.sendAction("previous") }
    menu.onTogglePlay = { [weak self] in self?.sendAction("togglePlay") }
    menu.onNext = { [weak self] in self?.sendAction("next") }
    menu.onRepeat = { [weak self] in self?.sendAction("repeat") }
    menu.onSeek = { [weak self] time in self?.sendSeek(time) }
    menu.onFocusYouTubeMusic = { [weak self] in self?.sendFocusYouTubeMusic() }
    logger.log("connector app starting logPath=\(logger.path)")

    connection.start(
      onMessage: { [weak self] message in
        self?.handle(message)
      },
      onDisconnect: { [weak self] in
        self?.logger.log("connector disconnected")
        self?.isReady = false
        self?.clearPlaybackStateRetry()
        self?.clearPlaybackStateStaleTimeout()
        self?.menu.updateConnectionStatus("Disconnected")
      }
    )

    connection.send(ConnectorProtocol.hello(requestId: nextRequestId("hello")))
  }

  private func handle(_ json: [String: Any]) {
    guard let message = HostMessage(json: json) else {
      let type = json["type"] as? String ?? "unknown"
      logger.log("received message could not be decoded type=\(type)")
      return
    }

    logger.log(
      "received message handling type=\(message.type) requestId=\(message.requestId ?? "none")"
    )

    switch message.type {
    case "connector.ready":
      isReady = true
      clearPlaybackStateStaleTimeout()
      menu.updateConnectionStatus("Connected")
      logger.log("connector ready; subscribing to playback state")
      connection.send(
        ConnectorProtocol.subscribePlayback(
          requestId: nextRequestId("subscribe")
        )
      )
      requestPlaybackState()
    case "playback.state":
      if let state = message.state {
        clearPlaybackStateRetry()
        clearPlaybackStateStaleTimeout()
        logger.log(playbackStateSummary(state))
        menu.updatePlayback(state)
        schedulePlaybackStateStaleTimeout()
      } else {
        logger.log("playback state message missing state payload")
      }
    case "connector.error":
      let label = userFacingStatus(code: message.code, message: message.message)
      logger.log("connector error \(label)")
      if isPlaybackStateRequestError(message) {
        logger.log("Waiting for YouTube Music")
        menu.updateConnectionStatus(label)
        schedulePlaybackStateRetry(reason: label)
        return
      }
      menu.updateConnectionStatus(label)
    default:
      logger.log("received message ignored type=\(message.type)")
      break
    }
  }

  private func requestPlaybackState() {
    guard isReady else {
      logger.log("playback state refresh skipped because connector is not ready")
      return
    }
    clearPlaybackStateRetry()
    logger.log("requesting playback state")
    connection.send(
      ConnectorProtocol.playbackStateRequest(requestId: nextRequestId("state"))
    )
  }

  private func sendAction(_ action: String) {
    guard isReady else {
      logger.log("playback action skipped because connector is not ready")
      return
    }
    logger.log("sending playback action \(action)")
    connection.send(
      ConnectorProtocol.playbackAction(
        action,
        requestId: nextRequestId("action")
      )
    )
  }

  private func sendSeek(_ time: Double) {
    guard isReady else {
      logger.log("playback seek skipped because connector is not ready")
      return
    }
    logger.log("sending playback seek time=\(time)")
    connection.send(
      ConnectorProtocol.playbackSeek(
        time: time,
        requestId: nextRequestId("seek")
      )
    )
  }

  private func sendFocusYouTubeMusic() {
    guard isReady else {
      logger.log("focus YouTube Music skipped because connector is not ready")
      return
    }
    logger.log("sending focus YouTube Music")
    connection.send(
      ConnectorProtocol.focusYouTubeMusic(
        requestId: nextRequestId("focus")
      )
    )
  }

  private func nextRequestId(_ prefix: String) -> String {
    nextRequestNumber += 1
    return "\(prefix)-\(nextRequestNumber)"
  }

  private func playbackStateSummary(_ state: PlaybackState) -> String {
    [
      "playback state",
      "title=\(logValue(state.title))",
      "artist=\(logValue(state.artist))",
      "album=\(logValue(state.album))",
      "nextTrack=\(logValue(state.nextTrack?.title))",
      "year=\(state.year.map(String.init) ?? "nil")",
      "playing=\(state.isPlaying)",
      "progress=\(Int(state.progress.rounded()))",
      "duration=\(Int(state.duration.rounded()))",
      "shuffle=\(state.isShuffling.map(String.init) ?? "nil")",
      "repeat=\(state.repeatMode ?? "nil")",
    ].joined(separator: " ")
  }

  private func isPlaybackStateRequestError(_ message: HostMessage) -> Bool {
    guard message.requestId?.hasPrefix("state-") == true else {
      return false
    }

    return message.message?.contains("Receiving end does not exist") == true
      || message.message?.contains("No active YouTube Music tab") == true
      || message.message?.contains("No YouTube Music tab") == true
  }

  private func schedulePlaybackStateRetry(reason: String) {
    clearPlaybackStateRetry()
    let retry = DispatchWorkItem { [weak self] in
      self?.playbackStateRetry = nil
      self?.logger.log("playback state retry starting")
      self?.requestPlaybackState()
    }
    playbackStateRetry = retry
    logger.log(
      "playback state retry scheduled reason=\(reason) delay=\(Self.playbackStateRetryDelaySeconds)"
    )
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.playbackStateRetryDelaySeconds,
      execute: retry
    )
  }

  private func schedulePlaybackStateStaleTimeout() {
    clearPlaybackStateStaleTimeout()
    let timeout = DispatchWorkItem { [weak self] in
      self?.playbackStateStaleTimeout = nil
      self?.markPlaybackStateStale()
    }
    playbackStateStaleTimeout = timeout
    logger.log(
      "playback state stale timeout scheduled delay=\(Self.playbackStateStaleTimeoutSeconds)"
    )
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.playbackStateStaleTimeoutSeconds,
      execute: timeout
    )
  }

  private func markPlaybackStateStale() {
    logger.log("playback state stale; marking controls as reconnecting")
    menu.setStalePlaybackState()
    requestPlaybackState()
  }

  private func clearPlaybackStateRetry() {
    playbackStateRetry?.cancel()
    playbackStateRetry = nil
  }

  private func clearPlaybackStateStaleTimeout() {
    playbackStateStaleTimeout?.cancel()
    playbackStateStaleTimeout = nil
  }

  private func userFacingStatus(code: String?, message: String?) -> String {
    switch code {
    case "host_disabled":
      return "Connected Apps disabled"
    case "connector_blocked":
      return "Connector disabled"
    case "unsupported_protocol":
      return "Update required"
    default:
      break
    }

    if message?.contains("Receiving end does not exist") == true
      || message?.contains("No active YouTube Music tab") == true
      || message?.contains("No YouTube Music tab") == true
    {
      return "No YouTube Music tab"
    }

    return message ?? code ?? "Connector error"
  }

  private func logValue(_ value: String?) -> String {
    guard let value, !value.isEmpty else { return "nil" }
    return "\"\(value)\""
  }
}
