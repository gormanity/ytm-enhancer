import AppKit
import Foundation

final class ConnectorApp {
  private static let playbackStateRetryDelaySeconds: TimeInterval = 2

  private let connection: NativeMessagingConnection
  private let menu: MenuBarController
  private let logger: NativeAppLogger
  private var nextRequestNumber = 0
  private var isReady = false
  private var playbackStateRetry: DispatchWorkItem?

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
    menu.onRefresh = { [weak self] in self?.requestPlaybackState() }
    logger.log("connector app starting logPath=\(logger.path)")

    connection.start(
      onMessage: { [weak self] message in
        self?.handle(message)
      },
      onDisconnect: { [weak self] in
        self?.logger.log("connector disconnected")
        self?.isReady = false
        self?.clearPlaybackStateRetry()
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
        logger.log(playbackStateSummary(state))
        menu.updatePlayback(state)
      } else {
        logger.log("playback state message missing state payload")
      }
    case "connector.error":
      let label = message.message ?? message.code ?? "Connector error"
      logger.log("connector error \(label)")
      if isPlaybackStateRequestError(message) {
        menu.updateConnectionStatus("Waiting for YouTube Music")
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

  private func nextRequestId(_ prefix: String) -> String {
    nextRequestNumber += 1
    return "\(prefix)-\(nextRequestNumber)"
  }

  private func playbackStateSummary(_ state: PlaybackState) -> String {
    [
      "playback state",
      "title=\(logValue(state.title))",
      "artist=\(logValue(state.artist))",
      "playing=\(state.isPlaying)",
      "progress=\(Int(state.progress.rounded()))",
      "duration=\(Int(state.duration.rounded()))",
    ].joined(separator: " ")
  }

  private func isPlaybackStateRequestError(_ message: HostMessage) -> Bool {
    guard message.requestId?.hasPrefix("state-") == true else {
      return false
    }

    return message.message?.contains("Receiving end does not exist") == true
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

  private func clearPlaybackStateRetry() {
    playbackStateRetry?.cancel()
    playbackStateRetry = nil
  }

  private func logValue(_ value: String?) -> String {
    guard let value, !value.isEmpty else { return "nil" }
    return "\"\(value)\""
  }
}
