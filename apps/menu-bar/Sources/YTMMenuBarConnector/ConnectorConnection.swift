import Foundation

protocol ConnectorConnection {
  func start(
    onMessage: @escaping ([String: Any]) -> Void,
    onDisconnect: @escaping () -> Void
  )
  func stop()
  func send(_ message: [String: Any])
}
