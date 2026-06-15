import Darwin
import Foundation

private enum MenuBarBridgeProtocol {
  static let socketPath = "/tmp/com.gormanity.ytm-enhancer.menu-bar.\(getuid()).sock"

  static func readMessage(from handle: FileHandle) -> [String: Any]? {
    let lengthData = handle.readData(ofLength: MemoryLayout<UInt32>.size)
    guard lengthData.count == MemoryLayout<UInt32>.size else { return nil }

    let bytes = [UInt8](lengthData)
    let length =
      UInt32(bytes[0])
      | UInt32(bytes[1]) << 8
      | UInt32(bytes[2]) << 16
      | UInt32(bytes[3]) << 24

    let payload = handle.readData(ofLength: Int(length))
    guard payload.count == Int(length) else { return nil }
    guard
      let json = try? JSONSerialization.jsonObject(with: payload),
      let message = json as? [String: Any]
    else {
      return nil
    }

    return message
  }

  static func writeMessage(_ message: [String: Any], to handle: FileHandle) {
    guard JSONSerialization.isValidJSONObject(message) else { return }
    guard
      let payload = try? JSONSerialization.data(withJSONObject: message)
    else {
      return
    }

    var length = UInt32(payload.count).littleEndian
    let lengthData = Data(bytes: &length, count: MemoryLayout<UInt32>.size)
    handle.write(lengthData)
    handle.write(payload)
  }

  static func socketAddress(
    for path: String,
    _ body: (UnsafePointer<sockaddr>, socklen_t) -> Int32
  ) -> Int32 {
    var address = sockaddr_un()
    address.sun_family = sa_family_t(AF_UNIX)

    let length = path.withCString { pathPointer -> socklen_t in
      let capacity = MemoryLayout.size(ofValue: address.sun_path)
      withUnsafeMutablePointer(to: &address.sun_path.0) { sunPathPointer in
        sunPathPointer.withMemoryRebound(to: CChar.self, capacity: capacity) { destination in
          memset(destination, 0, capacity)
          strncpy(destination, pathPointer, capacity - 1)
        }
      }
      return socklen_t(MemoryLayout<sa_family_t>.size + strlen(pathPointer) + 1)
    }

    return withUnsafePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { socketAddress in
        body(socketAddress, length)
      }
    }
  }
}

final class MenuBarBridgeServer {
  private let logger: NativeAppLogger
  private let writeQueue = DispatchQueue(label: "ytm-enhancer.menu-bar.bridge.server.write")
  private var serverDescriptor: Int32 = -1
  private var clientHandle: FileHandle?
  private var isRunning = false
  private var onHostConnected: (() -> Void)?
  private var onMessage: (([String: Any]) -> Void)?
  private var onHostDisconnected: (() -> Void)?

  init(logger: NativeAppLogger = NativeAppLogger()) {
    self.logger = logger
  }

  func start(
    onHostConnected: @escaping () -> Void,
    onMessage: @escaping ([String: Any]) -> Void,
    onHostDisconnected: @escaping () -> Void
  ) {
    guard !isRunning else { return }
    self.onHostConnected = onHostConnected
    self.onMessage = onMessage
    self.onHostDisconnected = onHostDisconnected

    unlink(MenuBarBridgeProtocol.socketPath)
    let descriptor = socket(AF_UNIX, SOCK_STREAM, 0)
    guard descriptor >= 0 else {
      logger.log("bridge server socket failed errno=\(errno)")
      return
    }

    let bindResult = MenuBarBridgeProtocol.socketAddress(
      for: MenuBarBridgeProtocol.socketPath
    ) { address, length in
      bind(descriptor, address, length)
    }
    guard bindResult == 0 else {
      logger.log("bridge server bind failed errno=\(errno)")
      close(descriptor)
      return
    }

    guard listen(descriptor, 1) == 0 else {
      logger.log("bridge server listen failed errno=\(errno)")
      close(descriptor)
      return
    }

    serverDescriptor = descriptor
    isRunning = true
    logger.log("bridge server listening path=\(MenuBarBridgeProtocol.socketPath)")

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      self?.acceptLoop()
    }
  }

  func stop() {
    isRunning = false
    if serverDescriptor >= 0 {
      close(serverDescriptor)
      serverDescriptor = -1
    }
    clientHandle?.closeFile()
    clientHandle = nil
    unlink(MenuBarBridgeProtocol.socketPath)
  }

  func send(_ message: [String: Any]) -> Bool {
    guard let clientHandle else { return false }
    writeQueue.async {
      MenuBarBridgeProtocol.writeMessage(message, to: clientHandle)
    }
    return true
  }

  private func acceptLoop() {
    while isRunning {
      let clientDescriptor = accept(serverDescriptor, nil, nil)
      guard clientDescriptor >= 0 else {
        if isRunning {
          logger.log("bridge server accept failed errno=\(errno)")
        }
        continue
      }

      DispatchQueue.main.async { [weak self] in
        self?.acceptClient(clientDescriptor)
      }
    }
  }

  private func acceptClient(_ descriptor: Int32) {
    clientHandle?.closeFile()
    let handle = FileHandle(fileDescriptor: descriptor, closeOnDealloc: true)
    clientHandle = handle
    logger.log("bridge server accepted native host")
    onHostConnected?()

    DispatchQueue.global(qos: .userInitiated).async { [weak self, weak handle] in
      guard let handle else { return }
      while let message = MenuBarBridgeProtocol.readMessage(from: handle) {
        DispatchQueue.main.async { [weak self] in
          self?.onMessage?(message)
        }
      }

      DispatchQueue.main.async { [weak self, weak handle] in
        guard let self, self.clientHandle === handle else { return }
        self.clientHandle = nil
        self.logger.log("bridge server native host disconnected")
        self.onHostDisconnected?()
      }
    }
  }
}

final class MenuBarBridgeClient {
  private let handle: FileHandle
  private let logger: NativeAppLogger
  private let writeQueue = DispatchQueue(label: "ytm-enhancer.menu-bar.bridge.client.write")
  private var isRunning = false

  private init(handle: FileHandle, logger: NativeAppLogger) {
    self.handle = handle
    self.logger = logger
  }

  static func connectIfAvailable(
    logger: NativeAppLogger = NativeAppLogger()
  ) -> MenuBarBridgeClient? {
    let descriptor = socket(AF_UNIX, SOCK_STREAM, 0)
    guard descriptor >= 0 else {
      logger.log("bridge client socket failed errno=\(errno)")
      return nil
    }

    let connectResult = MenuBarBridgeProtocol.socketAddress(
      for: MenuBarBridgeProtocol.socketPath
    ) { address, length in
      connect(descriptor, address, length)
    }

    guard connectResult == 0 else {
      close(descriptor)
      return nil
    }

    logger.log("bridge client connected path=\(MenuBarBridgeProtocol.socketPath)")
    return MenuBarBridgeClient(
      handle: FileHandle(fileDescriptor: descriptor, closeOnDealloc: true),
      logger: logger
    )
  }

  func start(
    onMessage: @escaping ([String: Any]) -> Void,
    onDisconnect: @escaping () -> Void
  ) {
    guard !isRunning else { return }
    isRunning = true

    DispatchQueue.global(qos: .userInitiated).async { [weak self] in
      guard let self else { return }
      while let message = MenuBarBridgeProtocol.readMessage(from: self.handle) {
        DispatchQueue.main.async {
          onMessage(message)
        }
      }

      DispatchQueue.main.async {
        self.logger.log("bridge client disconnected")
        onDisconnect()
      }
    }
  }

  func stop() {
    isRunning = false
    handle.closeFile()
  }

  func send(_ message: [String: Any]) {
    writeQueue.async { [handle] in
      MenuBarBridgeProtocol.writeMessage(message, to: handle)
    }
  }
}

final class BridgeUiConnection: ConnectorConnection {
  private let server: MenuBarBridgeServer
  private let logger: NativeAppLogger
  private var isHostConnected = false
  private var pendingMessages: [[String: Any]] = []
  private var lastHelloMessage: [String: Any]?

  init(
    server: MenuBarBridgeServer = MenuBarBridgeServer(),
    logger: NativeAppLogger = NativeAppLogger()
  ) {
    self.server = server
    self.logger = logger
  }

  func start(
    onMessage: @escaping ([String: Any]) -> Void,
    onDisconnect: @escaping () -> Void
  ) {
    server.start(
      onHostConnected: { [weak self] in
        self?.logger.log("bridge UI native host connected")
        self?.isHostConnected = true
        self?.flushPendingMessages()
      },
      onMessage: onMessage,
      onHostDisconnected: { [weak self] in
        self?.isHostConnected = false
        onDisconnect()
      }
    )
  }

  func stop() {
    server.stop()
  }

  func send(_ message: [String: Any]) {
    if message["type"] as? String == "connector.hello" {
      lastHelloMessage = message
    }

    if isHostConnected {
      _ = server.send(message)
      return
    }

    pendingMessages.append(message)
    pendingMessages = Array(pendingMessages.suffix(20))
  }

  private func flushPendingMessages() {
    if let lastHelloMessage {
      _ = server.send(lastHelloMessage)
    }

    let messages = pendingMessages.filter {
      ($0["type"] as? String) != "connector.hello"
    }
    pendingMessages.removeAll()

    for message in messages {
      _ = server.send(message)
    }
  }
}
