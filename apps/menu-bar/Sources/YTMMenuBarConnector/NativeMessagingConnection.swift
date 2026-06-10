import Foundation

final class NativeMessagingConnection {
  private let input: FileHandle
  private let output: FileHandle
  private let writeQueue = DispatchQueue(label: "ytm-enhancer.menu-bar.write")
  private var isRunning = false

  init(
    input: FileHandle = FileHandle.standardInput,
    output: FileHandle = FileHandle.standardOutput
  ) {
    self.input = input
    self.output = output
  }

  func start(
    onMessage: @escaping ([String: Any]) -> Void,
    onDisconnect: @escaping () -> Void
  ) {
    guard !isRunning else { return }
    isRunning = true

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      while self.isRunning {
        guard let length = self.readMessageLength() else { break }
        let payload = self.input.readData(ofLength: Int(length))
        if payload.count != Int(length) { break }

        guard
          let json = try? JSONSerialization.jsonObject(with: payload),
          let message = json as? [String: Any]
        else {
          continue
        }

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
  }

  func send(_ message: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(message) else { return }
    guard
      let payload = try? JSONSerialization.data(withJSONObject: message)
    else {
      return
    }

    writeQueue.async { [output] in
      var length = UInt32(payload.count).littleEndian
      let lengthData = Data(
        bytes: &length,
        count: MemoryLayout<UInt32>.size
      )
      output.write(lengthData)
      output.write(payload)
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
}
