import AppKit
import Foundation
import QuartzCore

private enum MenuBarStyle {
  static let width: CGFloat = 328
  static let background = NSColor(calibratedWhite: 0.02, alpha: 1)
  static let card = NSColor(calibratedWhite: 0.07, alpha: 1)
  static let cardBorder = NSColor(calibratedWhite: 0.22, alpha: 1)
  static let primaryText = NSColor.white
  static let secondaryText = NSColor(calibratedWhite: 0.68, alpha: 1)
  static let tertiaryText = NSColor(calibratedWhite: 0.45, alpha: 1)
  static let accent = NSColor(calibratedRed: 1, green: 0, blue: 0, alpha: 1)
  static let accentMuted = NSColor(calibratedRed: 1, green: 0, blue: 0, alpha: 0.22)
}

final class MenuBarNowPlayingView: NSView {
  private let effectView = NSVisualEffectView()
  private let artworkView = MenuBarArtworkView()
  private let titleTextView = MenuBarScrollingTextView()
  private let artistLabel = NSTextField(labelWithString: "Connecting")
  private let albumTextView = MenuBarScrollingTextView()
  private let badgeLabel = NSTextField(labelWithString: "Connector")
  private let progressTrack = NSView()
  private let progressFill = NSView()
  private let elapsedLabel = NSTextField(labelWithString: "")
  private let durationLabel = NSTextField(labelWithString: "")
  private var progressFraction: CGFloat = 0

  override var isFlipped: Bool { true }
  override var intrinsicContentSize: NSSize {
    NSSize(width: MenuBarStyle.width, height: 152)
  }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    frame = NSRect(origin: .zero, size: intrinsicContentSize)
    configure()
    updateConnectionStatus("Connecting")
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func updateConnectionStatus(_ status: String) {
    titleTextView.stringValue = "YTM Enhancer"
    artistLabel.stringValue = ""
    albumTextView.stringValue = status
    badgeLabel.stringValue = "Connector"
    badgeLabel.textColor = MenuBarStyle.secondaryText
    progressFraction = 0
    elapsedLabel.stringValue = ""
    durationLabel.stringValue = ""
    artworkView.showPlaceholder()
    needsLayout = true
  }

  func updatePlayback(_ state: PlaybackState) {
    let title = state.title?.isEmpty == false ? state.title! : "Unknown track"
    let artist = state.artist?.isEmpty == false ? state.artist! : "Unknown artist"

    titleTextView.stringValue = title
    artistLabel.stringValue = artist
    albumTextView.stringValue = formatAlbumLine(state)
    badgeLabel.stringValue = state.isPlaying ? "Playing" : "Paused"
    badgeLabel.textColor = state.isPlaying
      ? NSColor(calibratedRed: 0.58, green: 0.91, blue: 0.7, alpha: 1)
      : MenuBarStyle.secondaryText
    progressFraction = progressRatio(state)
    elapsedLabel.stringValue = state.duration > 0 ? formatTime(state.progress) : ""
    durationLabel.stringValue = state.duration > 0 ? formatTime(state.duration) : ""
    artworkView.update(artworkUrl: state.artworkUrl)
    needsLayout = true
  }

  override func layout() {
    super.layout()

    effectView.frame = bounds.insetBy(dx: 10, dy: 8)
    artworkView.frame = NSRect(x: 24, y: 28, width: 64, height: 64)
    titleTextView.frame = NSRect(x: 104, y: 23, width: 190, height: 24)
    artistLabel.frame = NSRect(x: 104, y: 49, width: 190, height: 18)
    albumTextView.frame = NSRect(x: 104, y: 68, width: 190, height: 18)
    badgeLabel.frame = NSRect(x: 104, y: 90, width: 96, height: 18)
    progressTrack.frame = NSRect(x: 24, y: 112, width: 280, height: 5)
    progressFill.frame = NSRect(
      x: 0,
      y: 0,
      width: progressTrack.bounds.width * progressFraction,
      height: progressTrack.bounds.height
    )
    elapsedLabel.frame = NSRect(x: 24, y: 123, width: 90, height: 16)
    durationLabel.frame = NSRect(x: 214, y: 123, width: 90, height: 16)
  }

  private func configure() {
    wantsLayer = true
    layer?.backgroundColor = MenuBarStyle.background.cgColor

    effectView.material = .hudWindow
    effectView.blendingMode = .withinWindow
    effectView.state = .active
    effectView.wantsLayer = true
    effectView.layer?.cornerRadius = 12
    effectView.layer?.borderWidth = 1
    effectView.layer?.borderColor = MenuBarStyle.cardBorder.cgColor
    addSubview(effectView)

    titleTextView.configure(
      font: .systemFont(ofSize: 15, weight: .semibold),
      textColor: MenuBarStyle.primaryText
    )
    configureLabel(artistLabel, font: .systemFont(ofSize: 13, weight: .regular))
    albumTextView.configure(
      font: .systemFont(ofSize: 12, weight: .regular),
      textColor: MenuBarStyle.tertiaryText
    )
    configureLabel(badgeLabel, font: .systemFont(ofSize: 11, weight: .medium))
    configureLabel(elapsedLabel, font: .monospacedDigitSystemFont(ofSize: 11, weight: .regular))
    configureLabel(durationLabel, font: .monospacedDigitSystemFont(ofSize: 11, weight: .regular))

    artistLabel.textColor = MenuBarStyle.secondaryText
    elapsedLabel.textColor = MenuBarStyle.tertiaryText
    durationLabel.textColor = MenuBarStyle.tertiaryText
    durationLabel.alignment = .right

    progressTrack.wantsLayer = true
    progressTrack.layer?.backgroundColor = NSColor(calibratedWhite: 0.23, alpha: 1).cgColor
    progressTrack.layer?.cornerRadius = 2.5
    progressFill.wantsLayer = true
    progressFill.layer?.backgroundColor = MenuBarStyle.accent.cgColor
    progressFill.layer?.cornerRadius = 2.5
    progressTrack.addSubview(progressFill)

    addSubview(artworkView)
    addSubview(titleTextView)
    addSubview(artistLabel)
    addSubview(albumTextView)
    addSubview(badgeLabel)
    addSubview(progressTrack)
    addSubview(elapsedLabel)
    addSubview(durationLabel)
  }

  private func configureLabel(_ label: NSTextField, font: NSFont) {
    label.font = font
    label.lineBreakMode = .byTruncatingTail
    label.isSelectable = false
    label.allowsDefaultTighteningForTruncation = true
  }

  private func progressRatio(_ state: PlaybackState) -> CGFloat {
    guard state.duration > 0 else { return 0 }
    return CGFloat(max(0, min(1, state.progress / state.duration)))
  }

  private func formatTime(_ value: Double) -> String {
    let seconds = max(0, Int(value.rounded()))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  private func formatAlbumLine(_ state: PlaybackState) -> String {
    var parts: [String] = []
    if let album = state.album, !album.isEmpty {
      parts.append(album)
    }
    if let year = state.year {
      parts.append(String(year))
    }
    return parts.joined(separator: " \u{00B7} ")
  }
}

private final class MenuBarScrollingTextView: NSView, CAAnimationDelegate {
  static let scrollPauseDelay: TimeInterval = 1.25

  private let label = NSTextField(labelWithString: "")
  private var scrollGeneration = 0
  private var pendingScroll: DispatchWorkItem?
  private var currentScrollOffset: CGFloat = 0
  private var isScrollAnimating = false
  private var lastVisibleWidth: CGFloat = -1
  private var lastTextWidth: CGFloat = -1

  override var isFlipped: Bool { true }

  var stringValue: String {
    get { label.stringValue }
    set {
      guard label.stringValue != newValue else { return }
      label.stringValue = newValue
      label.toolTip = newValue.isEmpty ? nil : newValue
      setAccessibilityLabel(newValue)
      lastTextWidth = -1
      needsLayout = true
    }
  }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    configure()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func configure(font: NSFont, textColor: NSColor) {
    label.font = font
    label.textColor = textColor
    lastTextWidth = -1
    needsLayout = true
  }

  override func layout() {
    super.layout()

    let textWidth = measuredTextWidth()
    let visibleWidth = bounds.width
    let changed =
      abs(visibleWidth - lastVisibleWidth) > 0.5 ||
      abs(textWidth - lastTextWidth) > 0.5

    lastVisibleWidth = visibleWidth
    lastTextWidth = textWidth

    if changed {
      restartScrollingIfNeeded()
      return
    }

    if !isScrollAnimating {
      label.frame = labelFrame(offset: currentScrollOffset)
    }
  }

  private var needsScroll: Bool {
    lastVisibleWidth > 0 && lastTextWidth > lastVisibleWidth + 4
  }

  private func configure() {
    wantsLayer = true
    layer?.masksToBounds = true

    label.wantsLayer = true
    label.lineBreakMode = .byClipping
    label.isSelectable = false
    label.allowsDefaultTighteningForTruncation = false
    label.cell?.usesSingleLineMode = true
    addSubview(label)
  }

  private func measuredTextWidth() -> CGFloat {
    guard !label.stringValue.isEmpty else { return 0 }
    return ceil(label.attributedStringValue.size().width) + 6
  }

  private func restartScrollingIfNeeded() {
    scrollGeneration += 1
    pendingScroll?.cancel()
    pendingScroll = nil
    label.layer?.removeAllAnimations()
    isScrollAnimating = false
    applyLabelFrame(offset: 0)

    guard needsScroll else { return }
    scheduleScroll(generation: scrollGeneration)
  }

  private func scheduleScroll(generation: Int) {
    let work = DispatchWorkItem { [weak self] in
      self?.performScroll(generation: generation)
    }
    pendingScroll = work
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.scrollPauseDelay,
      execute: work
    )
  }

  private func performScroll(generation: Int) {
    guard generation == scrollGeneration, needsScroll else { return }

    let overflow = max(0, lastTextWidth - lastVisibleWidth)
    let targetOffset = -overflow
    let duration = min(8, max(1.4, TimeInterval(overflow / 32)))

    isScrollAnimating = true
    currentScrollOffset = targetOffset

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    label.layer?.setAffineTransform(
      CGAffineTransform(translationX: targetOffset, y: 0)
    )
    CATransaction.commit()

    let animation = CABasicAnimation(keyPath: "transform.translation.x")
    animation.fromValue = 0
    animation.toValue = targetOffset
    animation.duration = duration
    animation.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
    animation.delegate = self
    animation.setValue(generation, forKey: "scrollGeneration")
    label.layer?.add(animation, forKey: "scroll")
  }

  func animationDidStop(_ animation: CAAnimation, finished flag: Bool) {
    guard
      flag,
      let generation = animation.value(forKey: "scrollGeneration") as? Int
    else { return }

    DispatchQueue.main.async { [weak self] in
      self?.scheduleResetAfterScroll(generation: generation)
    }
  }

  private func scheduleResetAfterScroll(generation: Int) {
    guard generation == scrollGeneration, needsScroll else { return }
    isScrollAnimating = false

    let work = DispatchWorkItem { [weak self] in
      guard
        let self,
        generation == self.scrollGeneration,
        self.needsScroll
      else { return }

      self.applyLabelFrame(offset: 0)
      self.scheduleScroll(generation: generation)
    }
    pendingScroll = work
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.scrollPauseDelay,
      execute: work
    )
  }

  private func applyLabelFrame(offset: CGFloat) {
    currentScrollOffset = offset
    label.frame = labelFrame(offset: offset)

    CATransaction.begin()
    CATransaction.setDisableActions(true)
    label.layer?.setAffineTransform(
      CGAffineTransform(translationX: offset, y: 0)
    )
    CATransaction.commit()
  }

  private func labelFrame(offset _: CGFloat) -> NSRect {
    NSRect(
      x: 0,
      y: 0,
      width: max(lastVisibleWidth, lastTextWidth),
      height: bounds.height
    )
  }
}

final class MenuBarControlsView: NSView {
  var onPrevious: (() -> Void)?
  var onTogglePlay: (() -> Void)?
  var onNext: (() -> Void)?

  private let previousButton = MenuBarIconButton(
    systemSymbolName: "backward.fill",
    label: "Previous"
  )
  private let playPauseButton = MenuBarIconButton(
    systemSymbolName: "play.fill",
    label: "Play",
    isPrimary: true
  )
  private let nextButton = MenuBarIconButton(
    systemSymbolName: "forward.fill",
    label: "Next"
  )
  private let effectView = NSVisualEffectView()

  override var isFlipped: Bool { true }
  override var intrinsicContentSize: NSSize {
    NSSize(width: MenuBarStyle.width, height: 66)
  }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    frame = NSRect(origin: .zero, size: intrinsicContentSize)
    configure()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func updatePlayback(isPlaying: Bool) {
    playPauseButton.setSystemSymbolName(isPlaying ? "pause.fill" : "play.fill")
    playPauseButton.setAccessibilityLabel(isPlaying ? "Pause" : "Play")
  }

  func setPlaybackControlsEnabled(_ enabled: Bool) {
    previousButton.isEnabled = enabled
    playPauseButton.isEnabled = enabled
    nextButton.isEnabled = enabled
  }

  override func layout() {
    super.layout()
    effectView.frame = bounds.insetBy(dx: 10, dy: 6)

    let centerX = bounds.midX
    playPauseButton.frame = NSRect(x: centerX - 22, y: 11, width: 44, height: 44)
    previousButton.frame = NSRect(x: centerX - 78, y: 15, width: 36, height: 36)
    nextButton.frame = NSRect(x: centerX + 42, y: 15, width: 36, height: 36)
  }

  private func configure() {
    wantsLayer = true
    layer?.backgroundColor = MenuBarStyle.background.cgColor

    effectView.material = .hudWindow
    effectView.blendingMode = .withinWindow
    effectView.state = .active
    effectView.wantsLayer = true
    effectView.layer?.cornerRadius = 12
    effectView.layer?.borderWidth = 1
    effectView.layer?.borderColor = MenuBarStyle.cardBorder.cgColor
    addSubview(effectView)

    previousButton.onPress = { [weak self] in self?.onPrevious?() }
    playPauseButton.onPress = { [weak self] in self?.onTogglePlay?() }
    nextButton.onPress = { [weak self] in self?.onNext?() }

    addSubview(previousButton)
    addSubview(playPauseButton)
    addSubview(nextButton)
    setPlaybackControlsEnabled(false)
  }
}

private final class MenuBarArtworkView: NSView {
  private let imageView = NSImageView()
  private var currentArtworkUrl: String?

  override var isFlipped: Bool { true }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    configure()
    showPlaceholder()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func update(artworkUrl: String?) {
    guard
      let artworkUrl,
      let url = URL(string: artworkUrl),
      let scheme = url.scheme?.lowercased(),
      scheme == "https" || scheme == "http"
    else {
      currentArtworkUrl = nil
      showPlaceholder()
      return
    }

    if artworkUrl == currentArtworkUrl { return }
    currentArtworkUrl = artworkUrl

    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard
        let self,
        self.currentArtworkUrl == artworkUrl,
        let data,
        let image = NSImage(data: data)
      else {
        DispatchQueue.main.async {
          if self?.currentArtworkUrl == artworkUrl {
            self?.showPlaceholder()
          }
        }
        return
      }

      DispatchQueue.main.async {
        guard self.currentArtworkUrl == artworkUrl else { return }
        self.imageView.image = image
        self.imageView.contentTintColor = nil
      }
    }.resume()
  }

  func showPlaceholder() {
    let image = NSImage(
      systemSymbolName: "music.note",
      accessibilityDescription: "No artwork"
    )
    image?.isTemplate = true
    imageView.image = image
    imageView.contentTintColor = MenuBarStyle.secondaryText
  }

  override func layout() {
    super.layout()
    imageView.frame = bounds
  }

  private func configure() {
    wantsLayer = true
    layer?.backgroundColor = MenuBarStyle.card.cgColor
    layer?.cornerRadius = 8
    layer?.borderWidth = 1
    layer?.borderColor = MenuBarStyle.cardBorder.cgColor
    layer?.masksToBounds = true

    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.wantsLayer = true
    imageView.layer?.cornerRadius = 8
    imageView.layer?.masksToBounds = true
    addSubview(imageView)
  }
}

private final class MenuBarIconButton: NSButton {
  var onPress: (() -> Void)?

  private var systemSymbolName: String
  private let primary: Bool

  init(systemSymbolName: String, label: String, isPrimary: Bool = false) {
    self.systemSymbolName = systemSymbolName
    self.primary = isPrimary
    super.init(frame: .zero)

    setAccessibilityLabel(label)
    setSystemSymbolName(systemSymbolName)
    target = self
    action = #selector(performPress)
    isBordered = false
    bezelStyle = .regularSquare
    imagePosition = .imageOnly
    imageScaling = .scaleProportionallyDown
    wantsLayer = true
    updateAppearance()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override var isHighlighted: Bool {
    didSet {
      updateAppearance()
    }
  }

  override var isEnabled: Bool {
    didSet {
      updateAppearance()
    }
  }

  func setSystemSymbolName(_ systemSymbolName: String) {
    self.systemSymbolName = systemSymbolName
    image = NSImage(
      systemSymbolName: systemSymbolName,
      accessibilityDescription: accessibilityLabel()
    )
  }

  override func layout() {
    super.layout()
    layer?.cornerRadius = min(bounds.width, bounds.height) / 2
  }

  private func updateAppearance() {
    let background: NSColor
    if primary {
      background = isHighlighted ? NSColor(calibratedRed: 0.8, green: 0, blue: 0, alpha: 1) : MenuBarStyle.accent
      contentTintColor = .white
    } else {
      background = isHighlighted
        ? NSColor(calibratedWhite: 0.3, alpha: 1)
        : MenuBarStyle.accentMuted
      contentTintColor = MenuBarStyle.primaryText
    }

    alphaValue = isEnabled ? 1 : 0.35
    layer?.backgroundColor = background.cgColor
  }

  @objc private func performPress() {
    onPress?()
  }
}
