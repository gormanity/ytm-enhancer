import AppKit
import Foundation

private enum MenuBarStyle {
  static let width: CGFloat = 328
  static let card = NSColor(calibratedWhite: 0.07, alpha: 1)
  static let cardBorder = NSColor(calibratedWhite: 0.22, alpha: 1)
  static let primaryText = NSColor.white
  static let secondaryText = NSColor(calibratedWhite: 0.68, alpha: 1)
  static let tertiaryText = NSColor(calibratedWhite: 0.45, alpha: 1)
  static let accent = NSColor(calibratedRed: 1, green: 0, blue: 0, alpha: 1)
  static let controlInactiveTint = NSColor(calibratedWhite: 0.46, alpha: 1)
  static let controlHoverBackground = NSColor(calibratedWhite: 1, alpha: 0.2)
  static let controlPressedBackground = NSColor(calibratedWhite: 1, alpha: 0.28)
  static let controlHoverShadow = NSColor.black.withAlphaComponent(0.55)
}

final class MenuBarNowPlayingView: NSView {
  private let artworkView = MenuBarArtworkView()
  private let titleTextView = MenuBarScrollingTextView()
  private let artistTextView = MenuBarScrollingTextView()
  private let albumTextView = MenuBarScrollingTextView()
  private let progressTrack = NSView()
  private let progressFill = NSView()
  private let elapsedLabel = NSTextField(labelWithString: "")
  private let durationLabel = NSTextField(labelWithString: "")
  private let controlsView = MenuBarControlsView()
  private let metadataScroller = MenuBarMetadataScroller()
  private var progressFraction: CGFloat = 0

  override var isFlipped: Bool { true }
  override var allowsVibrancy: Bool { true }
  override var intrinsicContentSize: NSSize {
    NSSize(width: MenuBarStyle.width, height: 190)
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
    artistTextView.stringValue = ""
    albumTextView.stringValue = status
    progressFraction = 0
    elapsedLabel.stringValue = ""
    durationLabel.stringValue = ""
    artworkView.showPlaceholder()
    controlsView.setPlaybackControlsEnabled(false)
    needsLayout = true
  }

  func updatePlayback(_ state: PlaybackState) {
    let title = state.title?.isEmpty == false ? state.title! : "Unknown track"
    let artist = state.artist?.isEmpty == false ? state.artist! : "Unknown artist"

    titleTextView.stringValue = title
    artistTextView.stringValue = artist
    albumTextView.stringValue = formatAlbumLine(state)
    progressFraction = progressRatio(state)
    elapsedLabel.stringValue = state.duration > 0 ? formatTime(state.progress) : ""
    durationLabel.stringValue = state.duration > 0 ? formatTime(state.duration) : ""
    artworkView.update(artworkUrl: state.artworkUrl)
    controlsView.updatePlayback(
      isPlaying: state.isPlaying,
      isShuffling: state.isShuffling,
      repeatMode: state.repeatMode
    )
    controlsView.setPlaybackControlsEnabled(true)
    needsLayout = true
  }

  func setControlActions(
    onShuffle: (() -> Void)?,
    onPrevious: (() -> Void)?,
    onTogglePlay: (() -> Void)?,
    onNext: (() -> Void)?,
    onRepeat: (() -> Void)?
  ) {
    controlsView.onShuffle = onShuffle
    controlsView.onPrevious = onPrevious
    controlsView.onTogglePlay = onTogglePlay
    controlsView.onNext = onNext
    controlsView.onRepeat = onRepeat
  }

  override func layout() {
    super.layout()

    artworkView.frame = NSRect(x: 24, y: 28, width: 64, height: 64)
    titleTextView.frame = NSRect(x: 104, y: 23, width: 190, height: 24)
    artistTextView.frame = NSRect(x: 104, y: 49, width: 190, height: 18)
    albumTextView.frame = NSRect(x: 104, y: 68, width: 190, height: 18)
    progressTrack.frame = NSRect(x: 24, y: 101, width: 280, height: 5)
    progressFill.frame = NSRect(
      x: 0,
      y: 0,
      width: progressTrack.bounds.width * progressFraction,
      height: progressTrack.bounds.height
    )
    elapsedLabel.frame = NSRect(x: 24, y: 112, width: 90, height: 16)
    durationLabel.frame = NSRect(x: 214, y: 112, width: 90, height: 16)
    controlsView.frame = NSRect(x: 0, y: 130, width: bounds.width, height: 52)
  }

  private func configure() {
    titleTextView.configure(
      font: .systemFont(ofSize: 15, weight: .semibold),
      textColor: MenuBarStyle.primaryText
    )
    artistTextView.configure(
      font: .systemFont(ofSize: 13, weight: .regular),
      textColor: MenuBarStyle.secondaryText
    )
    albumTextView.configure(
      font: .systemFont(ofSize: 12, weight: .regular),
      textColor: MenuBarStyle.tertiaryText
    )
    metadataScroller.register(titleTextView)
    metadataScroller.register(artistTextView)
    metadataScroller.register(albumTextView)

    configureLabel(elapsedLabel, font: .monospacedDigitSystemFont(ofSize: 11, weight: .regular))
    configureLabel(durationLabel, font: .monospacedDigitSystemFont(ofSize: 11, weight: .regular))

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
    addSubview(artistTextView)
    addSubview(albumTextView)
    addSubview(progressTrack)
    addSubview(elapsedLabel)
    addSubview(durationLabel)
    addSubview(controlsView)
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

private final class MenuBarScrollingTextView: NSView {
  private var text = ""
  private var font = NSFont.systemFont(ofSize: NSFont.systemFontSize)
  private var textColor = MenuBarStyle.primaryText
  private var scrollOffset: CGFloat = 0
  private var lastVisibleWidth: CGFloat = -1
  private var lastTextWidth: CGFloat = -1
  var onScrollMetricsChanged: (() -> Void)?

  override var isFlipped: Bool { true }

  var stringValue: String {
    get { text }
    set {
      guard text != newValue else { return }
      text = newValue
      toolTip = newValue.isEmpty ? nil : newValue
      setAccessibilityLabel(newValue)
      lastTextWidth = -1
      setScrollProgress(0)
      needsLayout = true
      needsDisplay = true
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
    self.font = font
    self.textColor = textColor
    lastTextWidth = -1
    setScrollProgress(0)
    needsLayout = true
    needsDisplay = true
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
      setScrollProgress(0)
      onScrollMetricsChanged?()
    }

    needsDisplay = true
  }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)

    guard !text.isEmpty else { return }

    let attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: textColor,
    ]
    let lineHeight = ceil(font.ascender - font.descender + font.leading)
    let y = max(0, (bounds.height - lineHeight) / 2)

    (text as NSString).draw(
      at: NSPoint(x: -scrollOffset, y: y),
      withAttributes: attributes
    )
  }

  private var needsScroll: Bool {
    lastVisibleWidth > 0 && lastTextWidth > lastVisibleWidth + 4
  }

  var scrollOverflow: CGFloat {
    guard needsScroll else { return 0 }
    return max(0, lastTextWidth - lastVisibleWidth)
  }

  func setScrollProgress(_ progress: CGFloat) {
    scrollOffset = scrollOverflow * max(0, min(1, progress))
    needsDisplay = true
  }

  private func configure() {
    wantsLayer = true
    layer?.masksToBounds = true
  }

  private func measuredTextWidth() -> CGFloat {
    guard !text.isEmpty else { return 0 }
    return ceil(
      (text as NSString).size(withAttributes: [.font: font]).width
    )
  }
}

private final class MenuBarMetadataScroller {
  static let scrollPauseDelay: TimeInterval = 1.25

  private static let frameInterval: TimeInterval = 1.0 / 60.0

  private var scrollingTextViews: [MenuBarScrollingTextView] = []
  private var scrollGeneration = 0
  private var pendingScroll: DispatchWorkItem?
  private var scrollTimer: Timer?

  deinit {
    cancelScrolling()
  }

  func register(_ scrollingTextView: MenuBarScrollingTextView) {
    scrollingTextViews.append(scrollingTextView)
    scrollingTextView.onScrollMetricsChanged = { [weak self] in
      self?.restartScrollingIfNeeded()
    }
  }

  private var maximumOverflow: CGFloat {
    scrollingTextViews.map(\.scrollOverflow).max() ?? 0
  }

  private var needsScroll: Bool {
    maximumOverflow > 0
  }

  private func restartScrollingIfNeeded() {
    scrollGeneration += 1
    cancelScrolling()
    setScrollProgress(0)

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

    let duration = min(8, max(1.4, TimeInterval(maximumOverflow / 32)))

    setScrollProgress(0)
    let startDate = Date()
    let timer = Timer(timeInterval: Self.frameInterval, repeats: true) {
      [weak self] timer in
      guard
        let self,
        generation == self.scrollGeneration,
        self.needsScroll
      else {
        timer.invalidate()
        return
      }

      let elapsed = Date().timeIntervalSince(startDate)
      let progress = min(1, elapsed / duration)
      self.setScrollProgress(progress)

      if progress >= 1 {
        timer.invalidate()
        self.scrollTimer = nil
        self.scheduleResetAfterScroll(generation: generation)
      }
    }
    scrollTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  private func scheduleResetAfterScroll(generation: Int) {
    guard generation == scrollGeneration, needsScroll else { return }

    let work = DispatchWorkItem { [weak self] in
      guard
        let self,
        generation == self.scrollGeneration,
        self.needsScroll
      else { return }

      self.setScrollProgress(0)
      self.scheduleScroll(generation: generation)
    }
    pendingScroll = work
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.scrollPauseDelay,
      execute: work
    )
  }

  private func setScrollProgress(_ progress: CGFloat) {
    scrollingTextViews.forEach { $0.setScrollProgress(progress) }
  }

  private func cancelScrolling() {
    pendingScroll?.cancel()
    pendingScroll = nil
    scrollTimer?.invalidate()
    scrollTimer = nil
  }
}

final class MenuBarControlsView: NSView {
  var onShuffle: (() -> Void)?
  var onPrevious: (() -> Void)?
  var onTogglePlay: (() -> Void)?
  var onNext: (() -> Void)?
  var onRepeat: (() -> Void)?

  private let shuffleButton = MenuBarIconButton(
    icon: MenuBarControlIcon.shuffle,
    label: "Shuffle"
  )
  private let previousButton = MenuBarIconButton(
    icon: MenuBarControlIcon.previous,
    label: "Previous",
    isProminent: true
  )
  private let playPauseButton = MenuBarIconButton(
    icon: MenuBarControlIcon.play,
    label: "Play",
    isProminent: true
  )
  private let nextButton = MenuBarIconButton(
    icon: MenuBarControlIcon.next,
    label: "Next",
    isProminent: true
  )
  private let repeatButton = MenuBarIconButton(
    icon: MenuBarControlIcon.repeat,
    label: "Repeat"
  )

  override var isFlipped: Bool { true }
  override var intrinsicContentSize: NSSize {
    NSSize(width: MenuBarStyle.width, height: 52)
  }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    frame = NSRect(origin: .zero, size: intrinsicContentSize)
    configure()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func updatePlayback(
    isPlaying: Bool,
    isShuffling: Bool?,
    repeatMode: String?
  ) {
    playPauseButton.setIcon(isPlaying ? MenuBarControlIcon.pause : MenuBarControlIcon.play)
    playPauseButton.setAccessibilityLabel(isPlaying ? "Pause" : "Play")
    shuffleButton.setActive(isShuffling == true)
    repeatButton.setIcon(repeatIcon(repeatMode))
    repeatButton.setAccessibilityLabel(repeatAccessibilityLabel(repeatMode))
    repeatButton.setActive((repeatMode ?? "off") != "off")
  }

  func setPlaybackControlsEnabled(_ enabled: Bool) {
    shuffleButton.isEnabled = enabled
    previousButton.isEnabled = enabled
    playPauseButton.isEnabled = enabled
    nextButton.isEnabled = enabled
    repeatButton.isEnabled = enabled
  }

  override func layout() {
    super.layout()

    let centerX = bounds.midX
    playPauseButton.frame = NSRect(x: centerX - 24, y: 2, width: 48, height: 48)
    previousButton.frame = NSRect(x: centerX - 76, y: 6, width: 40, height: 40)
    shuffleButton.frame = NSRect(x: centerX - 124, y: 8, width: 36, height: 36)
    nextButton.frame = NSRect(x: centerX + 36, y: 6, width: 40, height: 40)
    repeatButton.frame = NSRect(x: centerX + 88, y: 8, width: 36, height: 36)
  }

  private func configure() {
    wantsLayer = true
    layer?.backgroundColor = NSColor.clear.cgColor

    shuffleButton.onPress = { [weak self] in self?.onShuffle?() }
    previousButton.onPress = { [weak self] in self?.onPrevious?() }
    playPauseButton.onPress = { [weak self] in self?.onTogglePlay?() }
    nextButton.onPress = { [weak self] in self?.onNext?() }
    repeatButton.onPress = { [weak self] in self?.onRepeat?() }

    addSubview(shuffleButton)
    addSubview(previousButton)
    addSubview(playPauseButton)
    addSubview(nextButton)
    addSubview(repeatButton)
    setPlaybackControlsEnabled(false)
  }

  private func repeatIcon(_ repeatMode: String?) -> MenuBarControlIcon {
    repeatMode == "one" ? MenuBarControlIcon.repeatOne : MenuBarControlIcon.repeat
  }

  private func repeatAccessibilityLabel(_ repeatMode: String?) -> String {
    switch repeatMode {
    case "one":
      return "Repeat one"
    case "all":
      return "Repeat all"
    default:
      return "Repeat off"
    }
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

  private var icon: MenuBarControlIcon
  private let prominent: Bool
  private var active = false
  private var hovering = false

  init(icon: MenuBarControlIcon, label: String, isProminent: Bool = false) {
    self.icon = icon
    self.prominent = isProminent
    super.init(frame: .zero)

    setAccessibilityLabel(label)
    setIcon(icon)
    target = self
    action = #selector(performPress)
    isBordered = false
    bezelStyle = .regularSquare
    imagePosition = .imageOnly
    imageScaling = .scaleProportionallyDown
    wantsLayer = true
    layer?.masksToBounds = false
    layer?.shadowColor = MenuBarStyle.controlHoverShadow.cgColor
    layer?.shadowOffset = CGSize(width: 0, height: 2)
    layer?.shadowOpacity = 0
    layer?.shadowRadius = 8
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

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    trackingAreas.forEach(removeTrackingArea)
    addTrackingArea(
      NSTrackingArea(
        rect: bounds,
        options: [.activeInActiveApp, .inVisibleRect, .mouseEnteredAndExited],
        owner: self
      )
    )
  }

  override func mouseEntered(with event: NSEvent) {
    hovering = true
    updateAppearance()
    super.mouseEntered(with: event)
  }

  override func mouseExited(with event: NSEvent) {
    hovering = false
    updateAppearance()
    super.mouseExited(with: event)
  }

  func setIcon(_ icon: MenuBarControlIcon) {
    self.icon = icon
    image = icon.image(accessibilityDescription: accessibilityLabel())
  }

  func setActive(_ active: Bool) {
    self.active = active
    updateAppearance()
  }

  override func layout() {
    super.layout()
    layer?.cornerRadius = min(bounds.width, bounds.height) / 2
    layer?.shadowPath = CGPath(
      ellipseIn: bounds.insetBy(dx: -2, dy: -2),
      transform: nil
    )
  }

  private func updateAppearance() {
    let background: NSColor
    let showsHoverShadow = isEnabled && (hovering || isHighlighted)
    let shadowOpacity: Float = showsHoverShadow ? (isHighlighted ? 0.32 : 0.24) : 0
    if isHighlighted {
      background = MenuBarStyle.controlPressedBackground
    } else if hovering {
      background = MenuBarStyle.controlHoverBackground
    } else {
      background = .clear
    }

    let tintColor: NSColor
    if prominent || active || hovering {
      tintColor = .white
    } else {
      tintColor = MenuBarStyle.controlInactiveTint
    }

    alphaValue = isEnabled ? 0.9 : 0.35
    contentTintColor = tintColor
    layer?.backgroundColor = background.cgColor
    layer?.shadowColor = MenuBarStyle.controlHoverShadow.cgColor
    layer?.shadowOpacity = shadowOpacity
    layer?.shadowRadius = isHighlighted ? 10 : 8
  }

  @objc private func performPress() {
    onPress?()
  }
}
