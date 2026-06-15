import AppKit
import Foundation

final class NativeMessagingRelay {
  private let nativeConnection: NativeMessagingConnection
  private let bridgeClient: MenuBarBridgeClient
  private let logger: NativeAppLogger

  init(
    nativeConnection: NativeMessagingConnection,
    bridgeClient: MenuBarBridgeClient,
    logger: NativeAppLogger = NativeAppLogger()
  ) {
    self.nativeConnection = nativeConnection
    self.bridgeClient = bridgeClient
    self.logger = logger
  }

  func start() {
    logger.log("native messaging relay starting")

    bridgeClient.start(
      onMessage: { [weak self] message in
        self?.nativeConnection.send(message)
      },
      onDisconnect: { [weak self] in
        self?.logger.log("native messaging relay bridge disconnected")
        self?.nativeConnection.stop()
        NSApplication.shared.terminate(nil)
      }
    )

    nativeConnection.start(
      onMessage: { [weak self] message in
        self?.bridgeClient.send(message)
      },
      onDisconnect: { [weak self] in
        self?.logger.log("native messaging relay browser disconnected")
        self?.bridgeClient.stop()
        NSApplication.shared.terminate(nil)
      }
    )
  }
}
