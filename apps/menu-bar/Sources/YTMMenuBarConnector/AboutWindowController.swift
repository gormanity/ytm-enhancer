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
  private static let windowHeight: CGFloat = 590
  private static let contentInset: CGFloat = 22
  private static let contentWidth = windowWidth - (contentInset * 2)
  private static let panelInset: CGFloat = 14
  private static let panelContentWidth = contentWidth - (panelInset * 2)

  private var window: NSWindow!
  private let updateStatusLabel = NSTextField(wrappingLabelWithString: "")
  private let updateDetailLabel = NSTextField(wrappingLabelWithString: "")
  private let updateButton = NSButton(title: "", target: nil, action: nil)

  private var updateAction: AboutUpdateAction = .none
  private var onShowUpdateInterface: (() -> Void)?
  private var onCheckUpdateAvailability: (() -> Void)?
  private var onCopyHomebrewCommand: (() -> Void)?

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
      updateStatusLabel.stringValue = "Checking for updates..."
      updateDetailLabel.stringValue =
        "YTM Menu Bar is checking the direct install appcast in the background."
      updateButton.title = "Checking..."
      updateButton.isEnabled = false
      updateAction = .none
    case .upToDate:
      updateStatusLabel.stringValue = "YTM Menu Bar is up to date."
      updateDetailLabel.stringValue =
        "You are running the latest available version for this install."
      updateButton.title = "Check Again"
      updateButton.isEnabled = true
      updateAction = .checkAgain
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
    root.spacing = 16
    root.translatesAutoresizingMaskIntoConstraints = false

    let header = makeHeader()
    let connectorInfo = makeBodyLabel(
      "YTM Menu Bar is a companion app for YTM Enhancer, a browser extension that gives YouTube Music richer playback controls and connected-app support."
    )
    let dependencyInfo = makeBodyLabel(
      "Install YTM Enhancer in your browser with Connected Apps enabled before using the menu bar app. The app does not read YouTube Music pages directly."
    )
    let storeLinks = makeStoreLinkSection()
    let updateSection = makeUpdateSection()
    let separator = makeSeparator()
    let links = makeLinkRow()
    let uninstallRow = makeUninstallRow()

    root.addArrangedSubview(header)
    root.addArrangedSubview(separator)
    root.addArrangedSubview(connectorInfo)
    root.addArrangedSubview(dependencyInfo)
    root.addArrangedSubview(storeLinks)
    root.addArrangedSubview(updateSection)
    root.addArrangedSubview(links)
    root.addArrangedSubview(uninstallRow)

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
      storeLinks.widthAnchor.constraint(equalToConstant: Self.contentWidth),
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
    let panel = NSView()
    panel.wantsLayer = true
    panel.layer?.cornerRadius = 8
    panel.layer?.borderWidth = 1
    panel.layer?.borderColor = NSColor.separatorColor.cgColor
    panel.translatesAutoresizingMaskIntoConstraints = false

    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false

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

    stack.addArrangedSubview(titleLabel)
    stack.addArrangedSubview(updateStatusLabel)
    stack.addArrangedSubview(updateDetailLabel)
    stack.addArrangedSubview(updateButton)
    panel.addSubview(stack)

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
    return panel
  }

  private func makeLinkRow() -> NSView {
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
    return row
  }

  private func makeStoreLinkSection() -> NSView {
    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 8
    stack.translatesAutoresizingMaskIntoConstraints = false

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

    stack.addArrangedSubview(makeSectionLabel("Get YTM Enhancer"))
    stack.addArrangedSubview(row)
    return stack
  }

  private func makeUninstallRow() -> NSView {
    let stack = NSStackView()
    stack.orientation = .vertical
    stack.alignment = .leading
    stack.spacing = 8

    let text: String
    let buttonTitle: String
    switch DistributionChannel.current {
    case .direct:
      text = "Need to remove the app? The direct install includes an uninstaller."
      buttonTitle = "Uninstall..."
    case .homebrew:
      text = "Need to remove the app? Homebrew owns this install."
      buttonTitle = "Copy Uninstall Command"
    }

    let label = makeBodyLabel(text)
    label.preferredMaxLayoutWidth = Self.contentWidth
    stack.addArrangedSubview(label)
    stack.addArrangedSubview(
      makeLinkButton(title: buttonTitle, action: #selector(handleUninstallButton))
    )
    return stack
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
    guard
      FileManager.default.fileExists(
        atPath: AppMetadata.directUninstallerPath
      )
    else {
      showAlert(
        title: "YTM Menu Bar Uninstaller Was Not Found",
        message:
          "Install the latest direct package to add the uninstaller, or remove the app manually from Applications."
      )
      return
    }

    NSWorkspace.shared.open(
      URL(fileURLWithPath: AppMetadata.directUninstallerPath)
    )
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
    let info = Bundle.main.infoDictionary
    let version = info?["CFBundleShortVersionString"] as? String
      ?? AppMetadata.version
    let build = info?["CFBundleVersion"] as? String
      ?? AppMetadata.buildNumber
    return "Version \(version) (Build \(build))"
  }
}
