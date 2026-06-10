import AppKit
import Foundation

final class ConnectorApp {
  private let connection: NativeMessagingConnection
  private let menu: MenuBarController
  private var nextRequestNumber = 0
  private var isReady = false

  init(connection: NativeMessagingConnection, menu: MenuBarController) {
    self.connection = connection
    self.menu = menu
  }

  func start() {
    menu.onPrevious = { [weak self] in self?.sendAction("previous") }
    menu.onTogglePlay = { [weak self] in self?.sendAction("togglePlay") }
    menu.onNext = { [weak self] in self?.sendAction("next") }
    menu.onRefresh = { [weak self] in self?.requestPlaybackState() }

    connection.start(
      onMessage: { [weak self] message in
        self?.handle(message)
      },
      onDisconnect: { [weak self] in
        self?.menu.updateConnectionStatus("Disconnected")
      }
    )

    connection.send(ConnectorProtocol.hello(requestId: nextRequestId("hello")))
  }

  private func handle(_ json: [String: Any]) {
    guard let message = HostMessage(json: json) else { return }

    switch message.type {
    case "connector.ready":
      isReady = true
      menu.updateConnectionStatus("Connected")
      connection.send(
        ConnectorProtocol.subscribePlayback(
          requestId: nextRequestId("subscribe")
        )
      )
      requestPlaybackState()
    case "playback.state":
      if let state = message.state {
        menu.updatePlayback(state)
      }
    case "connector.error":
      let label = message.message ?? message.code ?? "Connector error"
      menu.updateConnectionStatus(label)
    default:
      break
    }
  }

  private func requestPlaybackState() {
    guard isReady else { return }
    connection.send(
      ConnectorProtocol.playbackStateRequest(requestId: nextRequestId("state"))
    )
  }

  private func sendAction(_ action: String) {
    guard isReady else { return }
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
}
