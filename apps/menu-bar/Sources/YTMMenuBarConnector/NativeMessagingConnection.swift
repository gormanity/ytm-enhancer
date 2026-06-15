import Foundation

final class NativeMessagingConnection: ConnectorConnection {
  private let input: FileHandle
  private let output: FileHandle
  private let logger: NativeAppLogger
  private let writeQueue = DispatchQueue(label: "ytm-enhancer.menu-bar.write")
  private var isRunning = false

  init(
    input: FileHandle = FileHandle.standardInput,
    output: FileHandle = FileHandle.standardOutput,
    logger: NativeAppLogger = NativeAppLogger()
  ) {
    self.input = input
    self.output = output
    self.logger = logger
  }

  func start(
    onMessage: @escaping ([String: Any]) -> Void,
    onDisconnect: @escaping () -> Void
  ) {
    guard !isRunning else { return }
    isRunning = true
    logger.log("native messaging connection starting")

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      while self.isRunning {
        guard let length = self.readMessageLength() else {
          self.logger.log("native messaging input closed")
          break
        }
        let payload = self.input.readData(ofLength: Int(length))
        if payload.count != Int(length) {
          self.logger.log(
            "native messaging payload truncated expected=\(length) actual=\(payload.count)"
          )
          break
        }

        guard
          let json = try? JSONSerialization.jsonObject(with: payload),
          let message = json as? [String: Any]
        else {
          self.logger.log("received message but JSON parsing failed")
          continue
        }

        self.logger.log(
          "received message type=\(self.messageType(message)) requestId=\(self.requestId(message)) bytes=\(payload.count)"
        )

        DispatchQueue.main.async {
          onMessage(message)
        }
      }

      DispatchQueue.main.async {
        onDisconnect()
      }
    }
  }

  func stop() {
    isRunning = false
    logger.log("native messaging connection stopping")
  }

  func send(_ message: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(message) else {
      logger.log(
        "sending message failed invalidJson type=\(messageType(message)) requestId=\(requestId(message))"
      )
      return
    }
    guard
      let payload = try? JSONSerialization.data(withJSONObject: message)
    else {
      logger.log(
        "sending message failed serialization type=\(messageType(message)) requestId=\(requestId(message))"
      )
      return
    }

    logger.log(
      "sending message type=\(messageType(message)) requestId=\(requestId(message)) bytes=\(payload.count)"
    )

    writeQueue.async { [output, logger] in
      var length = UInt32(payload.count).littleEndian
      let lengthData = Data(
        bytes: &length,
        count: MemoryLayout<UInt32>.size
      )
      output.write(lengthData)
      output.write(payload)
      logger.log("sent message bytes=\(payload.count)")
    }
  }

  private func readMessageLength() -> UInt32? {
    let lengthData = input.readData(ofLength: MemoryLayout<UInt32>.size)
    guard lengthData.count == MemoryLayout<UInt32>.size else { return nil }
    let bytes = [UInt8](lengthData)
    return UInt32(bytes[0])
      | UInt32(bytes[1]) << 8
      | UInt32(bytes[2]) << 16
      | UInt32(bytes[3]) << 24
  }

  private func messageType(_ message: [String: Any]) -> String {
    message["type"] as? String ?? "unknown"
  }

  private func requestId(_ message: [String: Any]) -> String {
    message["requestId"] as? String ?? "none"
  }
}
