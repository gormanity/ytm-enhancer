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
  private let albumTextView = MenuBarScrollingTextView()
  private let artistYearTextView = MenuBarScrollingTextView()
  private let seekBarView = MenuBarSeekBarView()
  private let elapsedLabel = NSTextField(labelWithString: "")
  private let durationLabel = NSTextField(labelWithString: "")
  private let controlsView = MenuBarControlsView()
  private let nextTrackDivider = NSView()
  private let nextTrackLabel = NSTextField(labelWithString: "")
  private let nextTrackArtworkView = MenuBarNextTrackArtworkView()
  private let nextTrackTitleTextView = MenuBarScrollingTextView()
  private let nextTrackDetailTextView = MenuBarScrollingTextView()
  private let metadataScroller = MenuBarMetadataScroller()
  private var currentDuration: Double = 0
  private var onSeek: ((Double) -> Void)?

  override var isFlipped: Bool { true }
  override var allowsVibrancy: Bool { true }
  override var intrinsicContentSize: NSSize {
    NSSize(width: MenuBarStyle.width, height: 252)
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
    albumTextView.stringValue = ""
    artistYearTextView.stringValue = status
    currentDuration = 0
    seekBarView.setProgress(0)
    seekBarView.setSeekEnabled(false)
    seekBarView.setDimmed(true)
    elapsedLabel.stringValue = ""
    durationLabel.stringValue = ""
    artworkView.showPlaceholder()
    controlsView.setPlaybackControlsEnabled(false)
    controlsView.setPlaybackControlsDimmed(true)
    updateNextTrack(nil)
    needsLayout = true
  }

  func setStalePlaybackState() {
    artistYearTextView.stringValue = "Reconnecting..."
    seekBarView.setDimmed(true)
    controlsView.setPlaybackControlsDimmed(true)
  }

  func updatePlayback(_ state: PlaybackState) {
    if isUnavailablePlaybackState(state) {
      titleTextView.stringValue = "No track loaded"
      albumTextView.stringValue = ""
      artistYearTextView.stringValue = ""
      currentDuration = 0
      seekBarView.setProgress(0)
      seekBarView.setSeekEnabled(false)
      seekBarView.setDimmed(true)
      elapsedLabel.stringValue = ""
      durationLabel.stringValue = ""
      artworkView.showPlaceholder()
      controlsView.updatePlayback(
        isPlaying: false,
        isShuffling: state.isShuffling,
        repeatMode: state.repeatMode
      )
      controlsView.setPlaybackControlsEnabled(false)
      controlsView.setPlaybackControlsDimmed(true)
      updateNextTrack(state.nextTrack)
      needsLayout = true
      return
    }

    let title = state.title?.isEmpty == false ? state.title! : "Unknown track"

    titleTextView.stringValue = title
    albumTextView.stringValue = state.album ?? ""
    artistYearTextView.stringValue = formatArtistYearLine(state)
    currentDuration = state.duration
    seekBarView.setProgress(progressRatio(state))
    seekBarView.setSeekEnabled(state.duration > 0)
    seekBarView.setDimmed(false)
    elapsedLabel.stringValue = state.duration > 0 ? formatTime(state.progress) : ""
    durationLabel.stringValue = state.duration > 0 ? formatTime(state.duration) : ""
    artworkView.update(artworkUrl: state.artworkUrl)
    controlsView.updatePlayback(
      isPlaying: state.isPlaying,
      isShuffling: state.isShuffling,
      repeatMode: state.repeatMode
    )
    updateNextTrack(state.nextTrack)
    controlsView.setPlaybackControlsEnabled(true)
    controlsView.setPlaybackControlsDimmed(false)
    needsLayout = true
  }

  func setControlActions(
    onShuffle: (() -> Void)?,
    onPrevious: (() -> Void)?,
    onTogglePlay: (() -> Void)?,
    onNext: (() -> Void)?,
    onRepeat: (() -> Void)?,
    onSeek: ((Double) -> Void)?
  ) {
    controlsView.onShuffle = onShuffle
    controlsView.onPrevious = onPrevious
    controlsView.onTogglePlay = onTogglePlay
    controlsView.onNext = onNext
    controlsView.onRepeat = onRepeat
    self.onSeek = onSeek
  }

  override func layout() {
    super.layout()

    artworkView.frame = NSRect(x: 24, y: 28, width: 64, height: 64)
    titleTextView.frame = NSRect(x: 104, y: 23, width: 190, height: 24)
    albumTextView.frame = NSRect(x: 104, y: 49, width: 190, height: 18)
    artistYearTextView.frame = NSRect(x: 104, y: 68, width: 190, height: 18)
    seekBarView.frame = NSRect(x: 24, y: 99, width: 280, height: 9)
    elapsedLabel.frame = NSRect(x: 24, y: 112, width: 90, height: 16)
    durationLabel.frame = NSRect(x: 214, y: 112, width: 90, height: 16)
    controlsView.frame = NSRect(x: 0, y: 130, width: bounds.width, height: 52)
    nextTrackDivider.frame = NSRect(x: 24, y: 188, width: 280, height: 1)
    nextTrackLabel.frame = NSRect(x: 24, y: 198, width: 280, height: 14)
    nextTrackArtworkView.frame = NSRect(x: 24, y: 214, width: 34, height: 34)
    nextTrackTitleTextView.frame = NSRect(x: 68, y: 215, width: 236, height: 18)
    nextTrackDetailTextView.frame = NSRect(x: 68, y: 234, width: 236, height: 16)
  }

  private func configure() {
    titleTextView.configure(
      font: .systemFont(ofSize: 15, weight: .semibold),
      textColor: MenuBarStyle.primaryText
    )
    albumTextView.configure(
      font: .systemFont(ofSize: 13, weight: .regular),
      textColor: MenuBarStyle.secondaryText
    )
    artistYearTextView.configure(
      font: .systemFont(ofSize: 12, weight: .regular),
      textColor: MenuBarStyle.tertiaryText
    )
    nextTrackTitleTextView.configure(
      font: .systemFont(ofSize: 12, weight: .semibold),
      textColor: MenuBarStyle.secondaryText
    )
    nextTrackDetailTextView.configure(
      font: .systemFont(ofSize: 11, weight: .regular),
      textColor: MenuBarStyle.tertiaryText
    )
    metadataScroller.register(titleTextView)
    metadataScroller.register(albumTextView)
    metadataScroller.register(artistYearTextView)
    metadataScroller.register(nextTrackTitleTextView)
    metadataScroller.register(nextTrackDetailTextView)

    configureLabel(elapsedLabel, font: .monospacedDigitSystemFont(ofSize: 11, weight: .regular))
    configureLabel(durationLabel, font: .monospacedDigitSystemFont(ofSize: 11, weight: .regular))
    configureLabel(nextTrackLabel, font: .systemFont(ofSize: 10, weight: .semibold))

    elapsedLabel.textColor = MenuBarStyle.tertiaryText
    durationLabel.textColor = MenuBarStyle.tertiaryText
    durationLabel.alignment = .right
    nextTrackLabel.textColor = MenuBarStyle.tertiaryText
    nextTrackLabel.stringValue = "Up Next"

    seekBarView.onSeek = { [weak self] fraction in
      guard let self, self.currentDuration > 0 else { return }
      self.onSeek?(Double(fraction) * self.currentDuration)
    }
    nextTrackDivider.wantsLayer = true
    nextTrackDivider.layer?.backgroundColor =
      MenuBarStyle.cardBorder.withAlphaComponent(0.8).cgColor

    addSubview(artworkView)
    addSubview(titleTextView)
    addSubview(albumTextView)
    addSubview(artistYearTextView)
    addSubview(seekBarView)
    addSubview(elapsedLabel)
    addSubview(durationLabel)
    addSubview(controlsView)
    addSubview(nextTrackDivider)
    addSubview(nextTrackLabel)
    addSubview(nextTrackArtworkView)
    addSubview(nextTrackTitleTextView)
    addSubview(nextTrackDetailTextView)
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

  private func isUnavailablePlaybackState(_ state: PlaybackState) -> Bool {
    let hasMetadata =
      state.title?.isEmpty == false ||
      state.artist?.isEmpty == false ||
      state.album?.isEmpty == false ||
      state.artworkUrl?.isEmpty == false

    return !hasMetadata && state.duration <= 0
  }

  private func formatTime(_ value: Double) -> String {
    let seconds = max(0, Int(value.rounded()))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
  }

  private func formatArtistYearLine(_ state: PlaybackState) -> String {
    var parts: [String] = []
    if let artist = state.artist, !artist.isEmpty {
      parts.append(artist)
    }
    if let year = state.year {
      parts.append(String(year))
    }
    return parts.joined(separator: " \u{00B7} ")
  }

  private func updateNextTrack(_ track: TrackMetadata?) {
    guard let track else {
      nextTrackTitleTextView.stringValue = "No upcoming track"
      nextTrackDetailTextView.stringValue = ""
      nextTrackArtworkView.showPlaceholder()
      return
    }

    let title = track.title?.isEmpty == false ? track.title! : "Unknown track"
    nextTrackTitleTextView.stringValue = title
    nextTrackDetailTextView.stringValue = track.artist ?? ""
    nextTrackArtworkView.update(artworkUrl: track.artworkUrl)
  }
}

private final class MenuBarSeekBarView: NSView {
  var onSeek: ((CGFloat) -> Void)?

  private let progressTrack = NSView()
  private let progressFill = NSView()
  private var progressFraction: CGFloat = 0
  private var seekEnabled = false

  override var isFlipped: Bool { true }

  override init(frame frameRect: NSRect) {
    super.init(frame: frameRect)
    configure()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  func setProgress(_ fraction: CGFloat) {
    progressFraction = max(0, min(1, fraction))
    needsLayout = true
  }

  func setSeekEnabled(_ enabled: Bool) {
    seekEnabled = enabled
    alphaValue = enabled ? 1 : 0.45
  }

  func setDimmed(_ dimmed: Bool) {
    alphaValue = dimmed ? 0.45 : 1
  }

  override func layout() {
    super.layout()

    let trackHeight: CGFloat = 5
    progressTrack.frame = NSRect(
      x: 0,
      y: (bounds.height - trackHeight) / 2,
      width: bounds.width,
      height: trackHeight
    )
    progressFill.frame = NSRect(
      x: 0,
      y: 0,
      width: progressTrack.bounds.width * progressFraction,
      height: progressTrack.bounds.height
    )
  }

  override func mouseDown(with event: NSEvent) {
    seek(with: event)
  }

  override func mouseDragged(with event: NSEvent) {
    seek(with: event)
  }

  override func resetCursorRects() {
    if seekEnabled {
      addCursorRect(bounds, cursor: .pointingHand)
    }
  }

  private func configure() {
    wantsLayer = true

    progressTrack.wantsLayer = true
    progressTrack.layer?.backgroundColor =
      NSColor(calibratedWhite: 0.23, alpha: 1).cgColor
    progressTrack.layer?.cornerRadius = 2.5

    progressFill.wantsLayer = true
    progressFill.layer?.backgroundColor = MenuBarStyle.accent.cgColor
    progressFill.layer?.cornerRadius = 2.5

    progressTrack.addSubview(progressFill)
    addSubview(progressTrack)
  }

  private func seek(with event: NSEvent) {
    guard seekEnabled, bounds.width > 0 else { return }

    let localPoint = convert(event.locationInWindow, from: nil)
    let fraction = max(0, min(1, localPoint.x / bounds.width))
    setProgress(fraction)
    onSeek?(fraction)
  }
}

private final class MenuBarScrollingTextView: NSView {
  private static let scrollLoopGap: CGFloat = 32

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

    drawLoopingCopy(attributes: attributes, y: y)
  }

  private var needsScroll: Bool {
    lastVisibleWidth > 0 && lastTextWidth > lastVisibleWidth + 4
  }

  var scrollDistance: CGFloat {
    guard needsScroll else { return 0 }
    return lastTextWidth + Self.scrollLoopGap
  }

  func setScrollProgress(_ progress: CGFloat) {
    scrollOffset = scrollDistance * max(0, min(1, progress))
    needsDisplay = true
  }

  private func drawLoopingCopy(
    attributes: [NSAttributedString.Key: Any],
    y: CGFloat
  ) {
    guard needsScroll else { return }

    (text as NSString).draw(
      at: NSPoint(x: -scrollOffset + lastTextWidth + Self.scrollLoopGap, y: y),
      withAttributes: attributes
    )
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

  private var maximumScrollDistance: CGFloat {
    scrollingTextViews.map(\.scrollDistance).max() ?? 0
  }

  private var needsScroll: Bool {
    maximumScrollDistance > 0
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

    let duration = min(8, max(1.4, TimeInterval(maximumScrollDistance / 32)))

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

  func setPlaybackControlsDimmed(_ dimmed: Bool) {
    alphaValue = dimmed ? 0.55 : 1
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

private final class MenuBarNextTrackArtworkView: NSView {
  private let imageView = NSImageView()
  private let monochromeContext = CIContext()
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

      let mutedImage = self.monochromeImage(from: image) ?? image

      DispatchQueue.main.async {
        guard self.currentArtworkUrl == artworkUrl else { return }
        self.imageView.image = mutedImage
        self.imageView.contentTintColor = nil
      }
    }.resume()
  }

  func showPlaceholder() {
    let image = NSImage(
      systemSymbolName: "music.note",
      accessibilityDescription: "No next track artwork"
    )
    image?.isTemplate = true
    imageView.image = image
    imageView.contentTintColor = MenuBarStyle.tertiaryText
  }

  override func layout() {
    super.layout()
    imageView.frame = bounds.insetBy(dx: 3, dy: 3)
  }

  private func configure() {
    wantsLayer = true
    layer?.backgroundColor = NSColor.white.withAlphaComponent(0.04).cgColor
    layer?.cornerRadius = 7
    layer?.borderWidth = 1
    layer?.borderColor = NSColor.white.withAlphaComponent(0.08).cgColor
    layer?.masksToBounds = true

    imageView.alphaValue = 0.34
    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.wantsLayer = true
    imageView.layer?.cornerRadius = 5
    imageView.layer?.masksToBounds = true
    imageView.layer?.compositingFilter = "plusLighter"
    addSubview(imageView)
  }

  private func monochromeImage(from image: NSImage) -> NSImage? {
    var proposedRect = NSRect(origin: .zero, size: image.size)
    guard
      let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil),
      let filter = CIFilter(name: "CIPhotoEffectMono")
    else {
      return nil
    }

    let input = CIImage(cgImage: cgImage)
    filter.setValue(input, forKey: kCIInputImageKey)

    guard
      let output = filter.outputImage,
      let mutedCgImage = monochromeContext.createCGImage(output, from: input.extent)
    else {
      return nil
    }

    return NSImage(cgImage: mutedCgImage, size: image.size)
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
