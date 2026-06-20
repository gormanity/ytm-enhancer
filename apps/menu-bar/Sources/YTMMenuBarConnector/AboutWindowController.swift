import AppKit
import Foundation

private enum AboutUpdateAction {
  case none
  case checkAgain
  case showSparkleUpdate
  case copyHomebrewCommand
}

final class AboutWindowController: NSObject {
  private static let windowWidth: CGFloat = 420
  private static let windowHeight: CGFloat = 500
  private static let contentInset: CGFloat = 22
  private static let contentWidth = windowWidth - (contentInset * 2)
  private static let panelInset: CGFloat = 14
  private static let panelContentWidth = contentWidth - (panelInset * 2)

  private var window: NSWindow!
  private let updateStatusLabel = NSTextField(wrappingLabelWithString: "")
  private let updateDetailLabel = NSTextField(wrappingLabelWithString: "")
  private let updateButton = NSButton(title: "", target: nil, action: nil)
  private let updateProgressIndicator = NSProgressIndicator()
  private let updateCheckmarkImageView = NSImageView()

  private var updateAction: AboutUpdateAction = .none
  private var onShowUpdateInterface: (() -> Void)?
  private var onCheckUpdateAvailability: (() -> Void)?
  private var onCopyHomebrewCommand: (() -> Void)?
  private var uninstallProcess: Process?

  override init() {
    super.init()
    window = Self.makeWindow()
    configure()
  }

  func show(
    status: MenuBarUpdateStatus,
    onShowUpdateInterface: @escaping () -> Void,
    onCheckUpdateAvailability: @escaping () -> Void,
    onCopyHomebrewCommand: @escaping () -> Void
  ) {
    self.onShowUpdateInterface = onShowUpdateInterface
    self.onCheckUpdateAvailability = onCheckUpdateAvailability
    self.onCopyHomebrewCommand = onCopyHomebrewCommand

    update(status: status)

    if !window.isVisible {
      window.center()
    }
    NSApp.activate(ignoringOtherApps: true)
    window.makeKeyAndOrderFront(nil)
  }

  func update(status: MenuBarUpdateStatus) {
    setUpdateChecking(false)
    setUpdateCheckComplete(false)

    switch status {
    case .homebrew:
      updateStatusLabel.stringValue = "Updates are managed by Homebrew."
      updateDetailLabel.stringValue = "Use Homebrew to update this install."
      updateButton.title = "Copy Update Command"
      updateButton.isEnabled = true
      updateAction = .copyHomebrewCommand
    case let .unavailable(reason):
      updateStatusLabel.stringValue = "Updates are unavailable for this build."
      updateDetailLabel.stringValue = reason
      updateButton.title = "Updates Unavailable"
      updateButton.isEnabled = false
      updateAction = .none
    case .idle:
      updateStatusLabel.stringValue = "Ready to check for updates."
      updateDetailLabel.stringValue =
        "This direct install can check the YTM Menu Bar appcast for updates."
      updateButton.title = "Check Again"
      updateButton.isEnabled = true
      updateAction = .checkAgain
    case .checking:
      if updateStatusLabel.stringValue.isEmpty {
        updateStatusLabel.stringValue = "Checking for updates."
      }
      if updateDetailLabel.stringValue.isEmpty {
        updateDetailLabel.stringValue =
          "YTM Menu Bar is checking for an app update in the background."
      }
      updateButton.title = "Check Again"
      updateButton.isEnabled = false
      updateAction = .none
      setUpdateChecking(true)
    case .upToDate:
      updateStatusLabel.stringValue = "YTM Menu Bar is up to date."
      updateDetailLabel.stringValue =
        "You are running the latest available version for this install."
      updateButton.title = "Check Again"
      updateButton.isEnabled = true
      updateAction = .checkAgain
      setUpdateCheckComplete(true)
    case let .updateAvailable(version):
      updateStatusLabel.stringValue = "YTM Menu Bar \(version) is available."
      updateDetailLabel.stringValue =
        "Download and install the update when you are ready."
      updateButton.title = "Download and Install..."
      updateButton.isEnabled = true
      updateAction = .showSparkleUpdate
    case let .failed(message):
      updateStatusLabel.stringValue = "Unable to check for updates."
      updateDetailLabel.stringValue = message
      updateButton.title = "Check Again"
      updateButton.isEnabled = true
      updateAction = .checkAgain
    }

    window.contentView?.layoutSubtreeIfNeeded()
  }

  private func setUpdateChecking(_ isChecking: Bool) {
    updateProgressIndicator.isHidden = !isChecking

    if isChecking {
      setUpdateCheckComplete(false)
      updateProgressIndicator.startAnimation(nil)
    } else {
      updateProgressIndicator.stopAnimation(nil)
    }
  }

  private func setUpdateCheckComplete(_ isComplete: Bool) {
    updateCheckmarkImageView.isHidden = !isComplete
  }

  func requestUninstall() {
    NSApp.activate(ignoringOtherApps: true)
    handleUninstallButton()
  }

  private static func makeWindow() -> NSWindow {
    let window = NSWindow(
      contentRect: NSRect(
        x: 0,
        y: 0,
        width: windowWidth,
        height: windowHeight
      ),
      styleMask: [.titled, .closable],
      backing: .buffered,
      defer: false
    )
    window.title = "About YTM Menu Bar"
    window.isReleasedWhenClosed = false
    window.collectionBehavior = [.moveToActiveSpace]
    return window
  }

  private func configure() {
    let contentView = NSView()

    let root = NSStackView()
    root.orientation = .vertical
    root.alignment = .leading
    root.spacing = 14
    root.translatesAutoresizingMaskIntoConstraints = false

    let header = makeHeader()
    let summary = makeBodyLabel(
      "Menu bar playback controls for YouTube Music through the YTM Enhancer browser extension."
    )
    let extensionSection = makeExtensionSection()
    let updateSection = makeUpdateSection()
    let separator = makeSeparator()
    let footerActions = makeFooterActions()

    root.addArrangedSubview(header)
    root.addArrangedSubview(summary)
    root.addArrangedSubview(extensionSection)
    root.addArrangedSubview(updateSection)
    root.addArrangedSubview(separator)
    root.addArrangedSubview(footerActions)

    contentView.addSubview(root)
    window.contentView = contentView
    NSLayoutConstraint.activate([
      root.topAnchor.constraint(
        equalTo: contentView.topAnchor,
        constant: Self.contentInset
      ),
      root.leadingAnchor.constraint(
        equalTo: contentView.leadingAnchor,
        constant: Self.contentInset
      ),
      root.trailingAnchor.constraint(
        equalTo: contentView.trailingAnchor,
        constant: -Self.contentInset
      ),
      root.bottomAnchor.constraint(
        lessThanOrEqualTo: contentView.bottomAnchor,
        constant: -Self.contentInset
      ),
      separator.widthAnchor.constraint(equalToConstant: Self.contentWidth),
      extensionSection.widthAnchor.constraint(equalToConstant: Self.contentWidth),
      updateSection.widthAnchor.constraint(equalToConstant: Self.contentWidth),
    ])
  }

  private func makeHeader() -> NSView {
    let header = NSStackView()
    header.orientation = .horizontal
    header.alignment = .centerY
    header.spacing = 14

    let iconView = NSImageView()
    iconView.image = MenuBarStatusIcon.extensionIcon()
      ?? MenuBarStatusIcon.monochromeIcon()
      ?? MenuBarStatusIcon.fallbackIcon(isPlaying: false)
    iconView.imageScaling = .scaleProportionallyUpOrDown
    iconView.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      iconView.widthAnchor.constraint(equalToConstant: 58),
      iconView.heightAnchor.constraint(equalToConstant: 58),
    ])

    let textStack = NSStackView()
    textStack.orientation = .vertical
    textStack.alignment = .leading
    textStack.spacing = 4
    textStack.addArrangedSubview(
      makeTitleLabel("YTM Menu Bar")
    )
    textStack.addArrangedSubview(
      makeBodyLabel(Self.versionText)
    )

    header.addArrangedSubview(iconView)
    header.addArrangedSubview(textStack)
    return header
  }

  private func makeUpdateSection() -> NSView {
    let panel = makePanel()
    let stack = makePanelStack()

    let titleLabel = makeSectionLabel("Updates")
    updateStatusLabel.font = .systemFont(ofSize: 13, weight: .semibold)
    updateStatusLabel.textColor = .labelColor
    updateStatusLabel.maximumNumberOfLines = 0
    updateStatusLabel.preferredMaxLayoutWidth = Self.panelContentWidth

    updateDetailLabel.font = .systemFont(ofSize: 12)
    updateDetailLabel.textColor = .secondaryLabelColor
    updateDetailLabel.maximumNumberOfLines = 0
    updateDetailLabel.preferredMaxLayoutWidth = Self.panelContentWidth

    updateButton.target = self
    updateButton.action = #selector(handleUpdateButton)
    updateButton.bezelStyle = .rounded

    updateProgressIndicator.style = .spinning
    updateProgressIndicator.controlSize = .small
    updateProgressIndicator.isDisplayedWhenStopped = false
    updateProgressIndicator.isIndeterminate = true
    updateProgressIndicator.isHidden = true
    updateProgressIndicator.translatesAutoresizingMaskIntoConstraints = false

    updateCheckmarkImageView.image = NSImage(
      systemSymbolName: "checkmark.circle.fill",
      accessibilityDescription: "Update check complete"
    )
    updateCheckmarkImageView.symbolConfiguration = NSImage.SymbolConfiguration(
      pointSize: 13,
      weight: .semibold
    )
    updateCheckmarkImageView.contentTintColor = .systemGreen
    updateCheckmarkImageView.isHidden = true
    updateCheckmarkImageView.translatesAutoresizingMaskIntoConstraints = false

    let updateActionRow = NSStackView()
    updateActionRow.orientation = .horizontal
    updateActionRow.alignment = .centerY
    updateActionRow.spacing = 8
    updateActionRow.addArrangedSubview(updateButton)
    updateActionRow.addArrangedSubview(updateProgressIndicator)
    updateActionRow.addArrangedSubview(updateCheckmarkImageView)

    stack.addArrangedSubview(titleLabel)
    stack.addArrangedSubview(updateStatusLabel)
    stack.addArrangedSubview(updateDetailLabel)
    stack.addArrangedSubview(updateActionRow)
    panel.addSubview(stack)

    constrainPanelStack(stack, in: panel)
    NSLayoutConstraint.activate([
      updateProgressIndicator.widthAnchor.constraint(equalToConstant: 16),
      updateProgressIndicator.heightAnchor.constraint(equalToConstant: 16),
      updateCheckmarkImageView.widthAnchor.constraint(equalToConstant: 16),
      updateCheckmarkImageView.heightAnchor.constraint(equalToConstant: 16),
    ])
    return panel
  }

  private func makeExtensionSection() -> NSView {
    let panel = makePanel()

    let stack = makePanelStack()
    let titleLabel = makeSectionLabel("Browser Extension")
    let detailLabel = makeBodyLabel(
      "Install YTM Enhancer and enable Connected Apps before using the menu bar app."
    )
    detailLabel.preferredMaxLayoutWidth = Self.panelContentWidth
    let row = NSStackView()
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 8
    row.addArrangedSubview(
      makeLinkButton(title: "Chrome", action: #selector(openChromeStore))
    )
    row.addArrangedSubview(
      makeLinkButton(title: "Edge", action: #selector(openEdgeStore))
    )
    row.addArrangedSubview(
      makeLinkButton(title: "Firefox", action: #selector(openFirefoxStore))
    )

    stack.addArrangedSubview(titleLabel)
    stack.addArrangedSubview(detailLabel)
    stack.addArrangedSubview(row)
    panel.addSubview(stack)

    constrainPanelStack(stack, in: panel)
    return panel
  }

  private func makeFooterActions() -> NSView {
    let row = NSStackView()
    row.orientation = .horizontal
    row.alignment = .centerY
    row.spacing = 8
    row.addArrangedSubview(
      makeLinkButton(title: "GitHub", action: #selector(openGitHub))
    )
    row.addArrangedSubview(
      makeLinkButton(title: "Releases", action: #selector(openReleases))
    )

    let buttonTitle: String
    switch DistributionChannel.current {
    case .direct:
      buttonTitle = "Uninstall..."
    case .homebrew:
      buttonTitle = "Copy Brew Uninstall"
    }

    row.addArrangedSubview(
      makeLinkButton(title: buttonTitle, action: #selector(handleUninstallButton))
    )
    return row
  }

  private func makePanel() -> NSView {
    let panel = NSView()
    panel.wantsLayer = true
    panel.layer?.cornerRadius = 8
    panel.layer?.borderWidth = 1
    panel.layer?.borderColor = NSColor.separatorColor.cgColor
    panel.translatesAutoresizingMaskIntoConstraints = false
    return panel
  }

  private func makePanelStack() -> NSStackView {
    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false
    return stack
  }

  private func constrainPanelStack(_ stack: NSStackView, in panel: NSView) {
    NSLayoutConstraint.activate([
      stack.topAnchor.constraint(
        equalTo: panel.topAnchor,
        constant: Self.panelInset
      ),
      stack.leadingAnchor.constraint(
        equalTo: panel.leadingAnchor,
        constant: Self.panelInset
      ),
      stack.trailingAnchor.constraint(
        lessThanOrEqualTo: panel.trailingAnchor,
        constant: -Self.panelInset
      ),
      stack.bottomAnchor.constraint(
        equalTo: panel.bottomAnchor,
        constant: -Self.panelInset
      ),
      stack.widthAnchor.constraint(equalToConstant: Self.panelContentWidth),
    ])
  }

  private func makeSeparator() -> NSView {
    let separator = NSBox()
    separator.boxType = .separator
    return separator
  }

  private func makeTitleLabel(_ text: String) -> NSTextField {
    let label = NSTextField(labelWithString: text)
    label.font = .systemFont(ofSize: 20, weight: .semibold)
    label.textColor = .labelColor
    return label
  }

  private func makeSectionLabel(_ text: String) -> NSTextField {
    let label = NSTextField(labelWithString: text)
    label.font = .systemFont(ofSize: 12, weight: .semibold)
    label.textColor = .secondaryLabelColor
    return label
  }

  private func makeBodyLabel(_ text: String) -> NSTextField {
    let label = NSTextField(wrappingLabelWithString: text)
    label.font = .systemFont(ofSize: 12)
    label.textColor = .secondaryLabelColor
    label.maximumNumberOfLines = 0
    label.preferredMaxLayoutWidth = Self.contentWidth
    return label
  }

  private func makeLinkButton(title: String, action: Selector) -> NSButton {
    let button = NSButton(title: title, target: self, action: action)
    button.bezelStyle = .rounded
    return button
  }

  @objc private func handleUpdateButton() {
    switch updateAction {
    case .none:
      break
    case .checkAgain:
      onCheckUpdateAvailability?()
    case .showSparkleUpdate:
      onShowUpdateInterface?()
    case .copyHomebrewCommand:
      onCopyHomebrewCommand?()
      updateDetailLabel.stringValue =
        "Copied: \(SparkleUpdater.homebrewUpdateCommand)"
    }
  }

  @objc private func openGitHub() {
    open("https://github.com/gormanity/ytm-enhancer")
  }

  @objc private func openReleases() {
    open("https://github.com/gormanity/ytm-enhancer/releases")
  }

  @objc private func openChromeStore() {
    open(
      "https://chromewebstore.google.com/detail/ytm-enhancer/bilcedjabgiedoamakekncokccabdccp"
    )
  }

  @objc private func openEdgeStore() {
    open(
      "https://microsoftedge.microsoft.com/addons/detail/ytm-enhancer/gamefnibdabclmkngggcjghpbhjmajkm"
    )
  }

  @objc private func openFirefoxStore() {
    open("https://addons.mozilla.org/en-US/firefox/addon/ytm-enhancer/")
  }

  @objc private func handleUninstallButton() {
    switch DistributionChannel.current {
    case .direct:
      openDirectUninstaller()
    case .homebrew:
      NSPasteboard.general.clearContents()
      NSPasteboard.general.setString(
        SparkleUpdater.homebrewUninstallCommand,
        forType: .string
      )
      showAlert(
        title: "Uninstall Command Copied",
        message: "Run \(SparkleUpdater.homebrewUninstallCommand) in Terminal."
      )
    }
  }

  private func openDirectUninstaller() {
    let hasPackagedUninstaller = FileManager.default.fileExists(
      atPath: AppMetadata.directUninstallerPath
    )
    let fallbackAppPath = directUninstallFallbackAppPath()

    guard hasPackagedUninstaller || fallbackAppPath != nil else {
      showAlert(
        title: "YTM Menu Bar Cannot Uninstall This Build",
        message: directUninstallerMissingMessage()
      )
      return
    }

    let alert = NSAlert()
    alert.messageText = "Uninstall YTM Menu Bar?"
    alert.informativeText =
      directUninstallConfirmationMessage(
        hasPackagedUninstaller: hasPackagedUninstaller
      )
    alert.addButton(withTitle: "Uninstall")
    alert.addButton(withTitle: "Cancel")
    guard alert.runModal() == .alertFirstButtonReturn else { return }

    if hasPackagedUninstaller {
      runDirectUninstaller(atPath: AppMetadata.directUninstallerPath)
      return
    }

    guard
      let fallbackAppPath,
      let fallbackPath = writeFallbackDirectUninstaller(appPath: fallbackAppPath)
    else {
      showAlert(
        title: "YTM Menu Bar Cannot Uninstall This Build",
        message: directUninstallerMissingMessage()
      )
      return
    }

    runDirectUninstaller(atPath: fallbackPath)
  }

  private func runDirectUninstaller(atPath uninstallerPath: String) {
    let process = Process()
    let errorPipe = Pipe()
    let script =
      "do shell script \"SUDO_USER=\(shellQuote(NSUserName())) YTM_MENU_BAR_UNINSTALL_ASSUME_YES=1 \(shellQuote(uninstallerPath))\" with administrator privileges"

    process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
    process.arguments = ["-e", script]
    process.standardError = errorPipe
    process.terminationHandler = { [weak self] process in
      let errorData = errorPipe.fileHandleForReading.readDataToEndOfFile()
      let errorText =
        String(data: errorData, encoding: .utf8)?
        .trimmingCharacters(in: .whitespacesAndNewlines)

      DispatchQueue.main.async {
        self?.uninstallProcess = nil
        guard process.terminationStatus != 0 else { return }

        self?.showAlert(
          title: "Uninstaller Did Not Complete",
          message: errorText?.isEmpty == false
            ? errorText!
            : "macOS did not allow YTM Menu Bar to start the uninstaller."
        )
      }
    }

    do {
      uninstallProcess = process
      try process.run()
    } catch {
      uninstallProcess = nil
      showAlert(
        title: "Could Not Start Uninstaller",
        message: error.localizedDescription
      )
      return
    }
  }

  private func directUninstallFallbackAppPath() -> String? {
    guard Bundle.main.bundleURL.pathExtension == "app" else {
      return nil
    }

    let appPath = Bundle.main.bundleURL.path
    guard appPath.hasPrefix("/Applications/")
      || appPath.hasPrefix("\(NSHomeDirectory())/Applications/")
    else {
      return nil
    }

    return appPath
  }

  private func writeFallbackDirectUninstaller(appPath: String) -> String? {
    let temporaryPath = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent(
        "ytm-menu-bar-uninstall-\(UUID().uuidString).command"
      )
    do {
      try fallbackDirectUninstallerScript(appPath: appPath).write(
        to: temporaryPath,
        atomically: true,
        encoding: .utf8
      )
      try FileManager.default.setAttributes(
        [.posixPermissions: 0o755],
        ofItemAtPath: temporaryPath.path
      )
      return temporaryPath.path
    } catch {
      logger.log("failed to write fallback uninstaller error=\(error)")
      return nil
    }
  }

  private func fallbackDirectUninstallerScript(appPath: String) -> String {
    let manifests = AppMetadata.productionNativeHostManifestPaths
      .map { "\"\($0.replacingOccurrences(of: "\"", with: "\\\""))\"" }
      .joined(separator: "\n  ")

    return """
      #!/usr/bin/env bash
      set -euo pipefail

      APP_NAME=\(shellQuote(AppMetadata.appName))
      APP_PATH=\(shellQuote(appPath))
      UNINSTALLER_PATH=\(shellQuote(AppMetadata.directUninstallerPath))
      EXECUTABLE_NAME=\(shellQuote(AppMetadata.executableName))
      HOST_NAME=\(shellQuote(AppMetadata.nativeHostName))

      PRODUCTION_MANIFEST_PATHS=(
        \(manifests)
      )

      remove_path() {
        local path="$1"
        if [[ -e "$path" || -L "$path" ]]; then
          rm -rf "$path"
        fi
      }

      forget_receipt() {
        local receipt="$1"
        if pkgutil --pkg-info "$receipt" >/dev/null 2>&1; then
          pkgutil --forget "$receipt" >/dev/null
        fi
      }

      user_home_for() {
        local user="$1"
        if [[ -z "$user" || "$user" == "root" ]]; then
          return 1
        fi

        dscl . -read "/Users/$user" NFSHomeDirectory 2>/dev/null |
          awk '{print $2}'
      }

      osascript -e "tell application \\"$APP_NAME\\" to quit" >/dev/null 2>&1 || true
      pkill -x "$EXECUTABLE_NAME" >/dev/null 2>&1 || true

      remove_path "$APP_PATH"

      for manifest_path in "${PRODUCTION_MANIFEST_PATHS[@]}"; do
        remove_path "$manifest_path"
      done

      original_user="${SUDO_USER:-}"
      original_home="$(user_home_for "$original_user" || true)"
      if [[ -n "$original_home" ]]; then
        remove_path "$original_home/Library/Application Support/Google/Chrome/NativeMessagingHosts/$HOST_NAME.json"
        remove_path "$original_home/Library/Application Support/Chromium/NativeMessagingHosts/$HOST_NAME.json"
        remove_path "$original_home/Library/Application Support/Microsoft Edge/NativeMessagingHosts/$HOST_NAME.json"
        remove_path "$original_home/Library/Application Support/Mozilla/NativeMessagingHosts/$HOST_NAME.json"
      fi

      forget_receipt \(shellQuote(AppMetadata.appPackageReceiptIdentifier))
      forget_receipt \(shellQuote(AppMetadata.nativeHostsPackageReceiptIdentifier))
      remove_path "$UNINSTALLER_PATH"
      remove_path "$0"
      """
  }

  private func directUninstallConfirmationMessage(
    hasPackagedUninstaller: Bool
  ) -> String {
    if hasPackagedUninstaller {
      return "This will close YTM Menu Bar and remove the app, native messaging manifests, and direct installer package receipts."
    }

    return "This install does not include the standalone uninstaller, so YTM Menu Bar will use its built-in uninstall flow. This will close the app and remove native messaging manifests and package receipts."
  }

  private func directUninstallerMissingMessage() -> String {
    if Bundle.main.bundleURL.pathExtension != "app" {
      return "This local build was not installed from a direct package, so it does not include the packaged uninstaller."
    }

    return "This app is not installed in Applications, so it cannot safely uninstall itself. Remove the app manually from its current location."
  }

  private func shellQuote(_ value: String) -> String {
    "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
  }

  private func showAlert(title: String, message: String) {
    let alert = NSAlert()
    alert.messageText = title
    alert.informativeText = message
    alert.addButton(withTitle: "OK")
    alert.runModal()
  }

  private func open(_ url: String) {
    guard let url = URL(string: url) else { return }
    NSWorkspace.shared.open(url)
  }

  private static var versionText: String {
    AppMetadata.versionText
  }
}
