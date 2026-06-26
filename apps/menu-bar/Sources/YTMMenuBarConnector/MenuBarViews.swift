import AppKit
import Foundation

private enum MenuBarStyle {
  static let width: CGFloat = 328
  static let contentInset: CGFloat = 18
  static let artworkSize: CGFloat = 64
  static let currentMetadataGap: CGFloat = 16
  static let nextTrackArtworkSize: CGFloat = 34
  static let nextTrackTextGap: CGFloat = 10
  static let card = NSColor(calibratedWhite: 0.07, alpha: 1)
  static let cardBorder = NSColor(calibratedWhite: 0.22, alpha: 1)
  static let primaryText = NSColor.white
  static let secondaryText = NSColor(calibratedWhite: 0.68, alpha: 1)
  static let tertiaryText = NSColor(calibratedWhite: 0.45, alpha: 1)
  static let staleText = NSColor(calibratedRed: 1, green: 0.62, blue: 0.24, alpha: 1)
  static let accent = NSColor(calibratedRed: 1, green: 0, blue: 0, alpha: 1)
  static let controlInactiveTint = NSColor(calibratedWhite: 0.46, alpha: 1)
  static let controlHoverBackground = NSColor(calibratedWhite: 1, alpha: 0.28)
  static let controlPressedBackground = NSColor(calibratedWhite: 1, alpha: 0.36)
  static let controlHoverBorder = NSColor(calibratedWhite: 1, alpha: 0.16)
  static let controlHoverShadow = NSColor.black.withAlphaComponent(0.55)
  static var fullWidthContentWidth: CGFloat {
    width - contentInset * 2
  }
  static var currentTextX: CGFloat {
    contentInset + artworkSize + currentMetadataGap
  }
  static var currentTextWidth: CGFloat {
    width - currentTextX - contentInset
  }
  static var nextTrackTextX: CGFloat {
    contentInset + nextTrackArtworkSize + nextTrackTextGap
  }
  static var nextTrackTextWidth: CGFloat {
    width - nextTrackTextX - contentInset
  }
}

final class MenuBarNowPlayingView: NSView {
  private static let pendingSeekHoldSeconds: TimeInterval = 1.5
  private static let pendingSeekToleranceSeconds: Double = 1.25

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
  private var pendingSeekTime: Double?
  private var pendingSeekExpirationDate: Date?
  private var onSeek: ((Double) -> Void)?
  private var mouseEventMonitor: Any?
  private var hoverPollTimer: Timer?

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

  deinit {
    uninstallMouseEventMonitor()
    stopHoverPolling()
  }

  override func viewDidMoveToWindow() {
    super.viewDidMoveToWindow()

    guard window != nil else {
      uninstallMouseEventMonitor()
      stopHoverPolling()
      clearHoverSurfaces()
      return
    }

    window?.acceptsMouseMovedEvents = true
    installMouseEventMonitor()
    startHoverPolling()
  }

  func updateConnectionStatus(_ status: String) {
    setCurrentPlaybackDimmed(false)
    restoreMetadataStatusStyle()
    titleTextView.stringValue = "YTM Enhancer"
    albumTextView.stringValue = ""
    artistYearTextView.stringValue = status
    currentDuration = 0
    clearPendingSeek()
    seekBarView.setProgress(0)
    seekBarView.setDuration(0)
    seekBarView.setSeekEnabled(false)
    seekBarView.setDimmed(true)
    clearHoverSurfaces()
    elapsedLabel.stringValue = ""
    durationLabel.stringValue = ""
    artworkView.showPlaceholder()
    controlsView.setPlaybackControlsEnabled(false)
    controlsView.setPlaybackControlsDimmed(true)
    updateNextTrack(nil)
    needsLayout = true
  }

  func setStalePlaybackState() {
    setCurrentPlaybackDimmed(true)
    emphasizeStaleStatusStyle()
    artistYearTextView.stringValue = "Waiting for playback updates..."
    seekBarView.setDimmed(true)
    controlsView.setPlaybackControlsDimmed(true)
    clearHoverSurfaces()
  }

  func updatePlayback(_ state: PlaybackState) {
    setCurrentPlaybackDimmed(false)
    restoreMetadataStatusStyle()

    if isUnavailablePlaybackState(state) {
      titleTextView.stringValue = "No track loaded"
      albumTextView.stringValue = ""
      artistYearTextView.stringValue = ""
      currentDuration = 0
      clearPendingSeek()
      seekBarView.setProgress(0)
      seekBarView.setDuration(0)
      seekBarView.setSeekEnabled(false)
      seekBarView.setDimmed(true)
      clearHoverSurfaces()
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
    seekBarView.setSeekEnabled(state.duration > 0)
    seekBarView.setDimmed(false)
    let displayProgress = displayProgress(for: state)
    updateProgressDisplay(progress: displayProgress, duration: state.duration)
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

    artworkView.frame = NSRect(x: MenuBarStyle.contentInset, y: 9, width: MenuBarStyle.artworkSize, height: MenuBarStyle.artworkSize)
    titleTextView.frame = NSRect(x: MenuBarStyle.currentTextX, y: 4, width: MenuBarStyle.currentTextWidth, height: 24)
    albumTextView.frame = NSRect(x: MenuBarStyle.currentTextX, y: 30, width: MenuBarStyle.currentTextWidth, height: 18)
    artistYearTextView.frame = NSRect(x: MenuBarStyle.currentTextX, y: 49, width: MenuBarStyle.currentTextWidth, height: 18)
    seekBarView.frame = NSRect(x: MenuBarStyle.contentInset, y: 80, width: MenuBarStyle.fullWidthContentWidth, height: 9)
    elapsedLabel.frame = NSRect(x: MenuBarStyle.contentInset, y: 93, width: 90, height: 16)
    durationLabel.frame = NSRect(x: MenuBarStyle.width - MenuBarStyle.contentInset - 90, y: 93, width: 90, height: 16)
    controlsView.frame = NSRect(x: 0, y: 111, width: bounds.width, height: 52)
    nextTrackDivider.frame = NSRect(x: MenuBarStyle.contentInset, y: 169, width: MenuBarStyle.fullWidthContentWidth, height: 1)
    nextTrackLabel.frame = NSRect(x: MenuBarStyle.contentInset, y: 179, width: MenuBarStyle.fullWidthContentWidth, height: 14)
    nextTrackArtworkView.frame = NSRect(x: MenuBarStyle.contentInset, y: 205, width: MenuBarStyle.nextTrackArtworkSize, height: MenuBarStyle.nextTrackArtworkSize)
    nextTrackTitleTextView.frame = NSRect(x: MenuBarStyle.nextTrackTextX, y: 206, width: MenuBarStyle.nextTrackTextWidth, height: 18)
    nextTrackDetailTextView.frame = NSRect(x: MenuBarStyle.nextTrackTextX, y: 225, width: MenuBarStyle.nextTrackTextWidth, height: 16)
  }

  private func configure() {
    setAccessibilityElement(false)

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
      let time = Double(fraction) * self.currentDuration
      self.applyOptimisticSeek(time)
      self.onSeek?(time)
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

  private func updateProgressDisplay(progress: Double, duration: Double) {
    seekBarView.setDuration(duration)
    seekBarView.setProgress(progressRatio(progress: progress, duration: duration))
    elapsedLabel.stringValue = duration > 0 ? formatTime(progress) : ""
    durationLabel.stringValue = duration > 0 ? formatTime(duration) : ""
  }

  private func progressRatio(progress: Double, duration: Double) -> CGFloat {
    guard duration > 0 else { return 0 }
    return CGFloat(max(0, min(1, progress / duration)))
  }

  private func applyOptimisticSeek(_ time: Double) {
    guard currentDuration > 0 else { return }
    let clampedTime = max(0, min(time, currentDuration))
    pendingSeekTime = clampedTime
    pendingSeekExpirationDate = Date().addingTimeInterval(Self.pendingSeekHoldSeconds)
    updateProgressDisplay(progress: clampedTime, duration: currentDuration)
  }

  private func displayProgress(for state: PlaybackState) -> Double {
    guard
      let pendingSeekTime,
      let pendingSeekExpirationDate
    else {
      return state.progress
    }

    if state.duration <= 0 || Date() > pendingSeekExpirationDate {
      clearPendingSeek()
      return state.progress
    }

    if abs(state.progress - pendingSeekTime) <= Self.pendingSeekToleranceSeconds {
      clearPendingSeek()
      return state.progress
    }

    return pendingSeekTime
  }

  private func clearPendingSeek() {
    pendingSeekTime = nil
    pendingSeekExpirationDate = nil
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

  private func installMouseEventMonitor() {
    uninstallMouseEventMonitor()
    mouseEventMonitor = NSEvent.addLocalMonitorForEvents(
      matching: [.mouseMoved, .leftMouseDown, .leftMouseDragged]
    ) { [weak self] event in
      self?.updateHoverSurfaces(with: event)
      return event
    }
  }

  private func uninstallMouseEventMonitor() {
    guard let mouseEventMonitor else { return }
    NSEvent.removeMonitor(mouseEventMonitor)
    self.mouseEventMonitor = nil
  }

  private func startHoverPolling() {
    stopHoverPolling()
    let timer = Timer(timeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
      guard let self, let window = self.window else {
        return
      }

      let mousePoint = window.mouseLocationOutsideOfEventStream
      self.updateHoverSurfaces(windowPoint: mousePoint)
    }
    hoverPollTimer = timer
    RunLoop.main.add(timer, forMode: .common)
    RunLoop.main.add(timer, forMode: .eventTracking)
  }

  private func stopHoverPolling() {
    hoverPollTimer?.invalidate()
    hoverPollTimer = nil
  }

  private func updateHoverSurfaces(with event: NSEvent) {
    guard let window, event.window === window else {
      clearHoverSurfaces()
      return
    }

    guard bounds.contains(convert(event.locationInWindow, from: nil)) else {
      clearHoverSurfaces()
      return
    }

    controlsView.updateHover(from: event)
    seekBarView.updateHover(from: event)
  }

  private func updateHoverSurfaces(windowPoint: NSPoint) {
    guard bounds.contains(convert(windowPoint, from: nil)) else {
      clearHoverSurfaces()
      return
    }

    controlsView.updateHover(windowPoint: windowPoint)
    seekBarView.updateHover(windowPoint: windowPoint)
  }

  private func clearHoverSurfaces() {
    controlsView.clearHoverState()
    seekBarView.clearHoverState()
  }

  private func setCurrentPlaybackDimmed(_ dimmed: Bool) {
    titleTextView.setDimmed(dimmed)
    albumTextView.setDimmed(dimmed)
    artworkView.setDimmed(dimmed)
    elapsedLabel.alphaValue = dimmed ? 0.5 : 1
    durationLabel.alphaValue = dimmed ? 0.5 : 1
  }

  private func emphasizeStaleStatusStyle() {
    artistYearTextView.configure(
      font: .systemFont(ofSize: 12, weight: .semibold),
      textColor: MenuBarStyle.staleText
    )
  }

  private func restoreMetadataStatusStyle() {
    artistYearTextView.configure(
      font: .systemFont(ofSize: 12, weight: .regular),
      textColor: MenuBarStyle.tertiaryText
    )
  }
}

private final class MenuBarSeekBarView: NSView {
  var onSeek: ((CGFloat) -> Void)?

  private let progressTrack = NSView()
  private let progressFill = NSView()
  private let seekTooltipLabel = NSTextField(labelWithString: "")
  private var progressFraction: CGFloat = 0
  private var duration: Double = 0
  private var seekEnabled = false
  private var trackingArea: NSTrackingArea?

  override var isFlipped: Bool { true }
  override var wantsDefaultClipping: Bool { false }

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

  func setDuration(_ duration: Double) {
    self.duration = max(0, duration)
    if duration <= 0 {
      hideSeekTooltip()
    }
  }

  func setSeekEnabled(_ enabled: Bool) {
    seekEnabled = enabled
    alphaValue = enabled ? 1 : 0.45
    if !enabled {
      hideSeekTooltip()
    }
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

  override func updateTrackingAreas() {
    super.updateTrackingAreas()
    if let trackingArea {
      removeTrackingArea(trackingArea)
    }
    let nextTrackingArea = NSTrackingArea(
      rect: bounds,
      options: [
        .activeInActiveApp,
        .inVisibleRect,
        .mouseEnteredAndExited,
        .mouseMoved,
        .enabledDuringMouseDrag,
      ],
      owner: self
    )
    addTrackingArea(nextTrackingArea)
    trackingArea = nextTrackingArea
  }

  override func mouseDown(with event: NSEvent) {
    updateSeekTooltip(with: event)
    seek(with: event)
  }

  override func mouseDragged(with event: NSEvent) {
    updateSeekTooltip(with: event)
    seek(with: event)
  }

  override func mouseEntered(with event: NSEvent) {
    updateSeekTooltip(with: event)
  }

  override func mouseMoved(with event: NSEvent) {
    updateSeekTooltip(with: event)
  }

  override func mouseExited(with event: NSEvent) {
    hideSeekTooltip()
  }

  override func resetCursorRects() {
    if seekEnabled {
      addCursorRect(bounds, cursor: .pointingHand)
    }
  }

  private func configure() {
    wantsLayer = true
    layer?.masksToBounds = false

    progressTrack.wantsLayer = true
    progressTrack.layer?.backgroundColor =
      NSColor(calibratedWhite: 0.23, alpha: 1).cgColor
    progressTrack.layer?.cornerRadius = 2.5

    progressFill.wantsLayer = true
    progressFill.layer?.backgroundColor = MenuBarStyle.accent.cgColor
    progressFill.layer?.cornerRadius = 2.5

    progressTrack.addSubview(progressFill)
    addSubview(progressTrack)
    configureSeekTooltip()
    addSubview(seekTooltipLabel)
  }

  func updateHover(from event: NSEvent) {
    updateSeekTooltip(with: event)
  }

  func updateHover(windowPoint: NSPoint) {
    updateSeekTooltip(windowPoint: windowPoint)
  }

  func clearHoverState() {
    hideSeekTooltip()
  }

  private func seek(with event: NSEvent) {
    guard seekEnabled, bounds.width > 0 else { return }

    let fraction = seekFraction(for: event)
    setProgress(fraction)
    onSeek?(fraction)
  }

  private func updateSeekTooltip(with event: NSEvent) {
    guard seekEnabled, duration > 0, bounds.width > 0 else {
      hideSeekTooltip()
      return
    }
    guard isMouseInsideBounds(event) else {
      hideSeekTooltip()
      return
    }

    let fraction = seekFraction(for: event)
    let time = formatTime(Double(fraction) * duration)
    let localPoint = convert(event.locationInWindow, from: nil)
    let width = max(42, seekTooltipLabel.intrinsicContentSize.width + 12)
    let x = max(0, min(bounds.width - width, localPoint.x - width / 2))
    seekTooltipLabel.stringValue = time
    seekTooltipLabel.frame = NSRect(x: x, y: -22, width: width, height: 18)
    seekTooltipLabel.isHidden = false
  }

  private func updateSeekTooltip(windowPoint: NSPoint) {
    guard seekEnabled, duration > 0, bounds.width > 0 else {
      hideSeekTooltip()
      return
    }

    let localPoint = convert(windowPoint, from: nil)
    guard bounds.contains(localPoint) else {
      hideSeekTooltip()
      return
    }

    let fraction = max(0, min(1, localPoint.x / bounds.width))
    let time = formatTime(Double(fraction) * duration)
    let width = max(42, seekTooltipLabel.intrinsicContentSize.width + 12)
    let x = max(0, min(bounds.width - width, localPoint.x - width / 2))
    seekTooltipLabel.stringValue = time
    seekTooltipLabel.frame = NSRect(x: x, y: -22, width: width, height: 18)
    seekTooltipLabel.isHidden = false
  }

  private func hideSeekTooltip() {
    seekTooltipLabel.isHidden = true
  }

  private func seekFraction(for event: NSEvent) -> CGFloat {
    let localPoint = convert(event.locationInWindow, from: nil)
    return max(0, min(1, localPoint.x / bounds.width))
  }

  private func isMouseInsideBounds(_ event: NSEvent) -> Bool {
    bounds.contains(convert(event.locationInWindow, from: nil))
  }

  private func configureSeekTooltip() {
    seekTooltipLabel.font = .monospacedDigitSystemFont(ofSize: 10, weight: .semibold)
    seekTooltipLabel.textColor = MenuBarStyle.primaryText
    seekTooltipLabel.alignment = .center
    seekTooltipLabel.isSelectable = false
    seekTooltipLabel.isHidden = true
    seekTooltipLabel.wantsLayer = true
    seekTooltipLabel.layer?.backgroundColor =
      NSColor.black.withAlphaComponent(0.72).cgColor
    seekTooltipLabel.layer?.cornerRadius = 5
  }

  private func formatTime(_ value: Double) -> String {
    let seconds = max(0, Int(value.rounded()))
    return String(format: "%d:%02d", seconds / 60, seconds % 60)
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
      updateScrollMetrics()
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
    updateScrollMetrics()
    needsLayout = true
    needsDisplay = true
  }

  func setDimmed(_ dimmed: Bool) {
    alphaValue = dimmed ? 0.5 : 1
  }

  override func layout() {
    super.layout()

    updateScrollMetrics()
    needsDisplay = true
  }

  private func updateScrollMetrics() {
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

  func completeScrollLoop() {
    guard needsScroll else { return }
    scrollOffset = scrollDistance
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

  private let logger = NativeAppLogger()
  private let scrollDiagnosticsEnabled =
    ProcessInfo.processInfo.environment["YTM_MENU_BAR_SCROLL_QA"] == "1"
  private var scrollingTextViews: [MenuBarScrollingTextView] = []
  private var scrollGeneration = 0
  private var reportedScrollGeneration: Int?
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
    reportedScrollGeneration = nil
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

      if self.scrollDiagnosticsEnabled,
        self.reportedScrollGeneration != generation,
        progress >= 0.08
      {
        self.reportedScrollGeneration = generation
        self.logger.log(
          "metadata scroll advanced progress=\(String(format: "%.2f", progress)) distance=\(Int(self.maximumScrollDistance.rounded()))"
        )
      }

      if progress >= 1 {
        self.completeScrollLoop()
        timer.invalidate()
        self.scrollTimer = nil
        self.scheduleNextScrollAfterLoop(generation: generation)
      }
    }
    scrollTimer = timer
    RunLoop.main.add(timer, forMode: .common)
  }

  private func scheduleNextScrollAfterLoop(generation: Int) {
    guard generation == scrollGeneration, needsScroll else { return }

    let work = DispatchWorkItem { [weak self] in
      guard
        let self,
        generation == self.scrollGeneration,
        self.needsScroll
      else { return }

      self.performScroll(generation: generation)
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

  private func completeScrollLoop() {
    scrollingTextViews.forEach { $0.completeScrollLoop() }
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
    repeatButton.setRepeatMarker(repeatMarker(repeatMode))
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

  func updateHover(from event: NSEvent) {
    let localPoint = convert(event.locationInWindow, from: nil)
    updateHover(localPoint: localPoint)
  }

  func updateHover(windowPoint: NSPoint) {
    let localPoint = convert(windowPoint, from: nil)
    updateHover(localPoint: localPoint)
  }

  private func updateHover(localPoint: NSPoint) {
    shuffleButton.setHovering(shuffleButton.frame.contains(localPoint))
    previousButton.setHovering(previousButton.frame.contains(localPoint))
    playPauseButton.setHovering(playPauseButton.frame.contains(localPoint))
    nextButton.setHovering(nextButton.frame.contains(localPoint))
    repeatButton.setHovering(repeatButton.frame.contains(localPoint))
  }

  func clearHoverState() {
    shuffleButton.setHovering(false)
    previousButton.setHovering(false)
    playPauseButton.setHovering(false)
    nextButton.setHovering(false)
    repeatButton.setHovering(false)
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
    setAccessibilityElement(false)
    setAccessibilityChildren([
      shuffleButton,
      previousButton,
      playPauseButton,
      nextButton,
      repeatButton,
    ])

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

  private func repeatMarker(_ repeatMode: String?) -> MenuBarIconButton.Marker {
    switch repeatMode {
    case "all":
      return .dot
    default:
      return .none
    }
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
  private let logger = NativeAppLogger()
  private var requestedArtworkUrl: String?
  private var loadingArtworkUrl: String?
  private var displayedArtworkUrl: String?

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
      requestedArtworkUrl = nil
      loadingArtworkUrl = nil
      displayedArtworkUrl = nil
      showPlaceholder()
      return
    }

    if artworkUrl == displayedArtworkUrl || artworkUrl == loadingArtworkUrl {
      return
    }
    requestedArtworkUrl = artworkUrl
    loadingArtworkUrl = artworkUrl
    logger.log("current artwork loading url=\(artworkUrl)")

    URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
      guard
        let self,
        self.requestedArtworkUrl == artworkUrl
      else {
        return
      }

      let statusCode = (response as? HTTPURLResponse)?.statusCode
      let status = statusCode.map(String.init) ?? "none"
      let errorMessage = error?.localizedDescription ?? "none"
      guard
        let data,
        let image = NSImage(data: data)
      else {
        self.logger.log(
          "current artwork failed url=\(artworkUrl) status=\(status) bytes=\(data?.count ?? 0) error=\(errorMessage)"
        )
        DispatchQueue.main.async {
          if self.requestedArtworkUrl == artworkUrl {
            self.loadingArtworkUrl = nil
            self.displayedArtworkUrl = nil
            self.showPlaceholder()
          }
        }
        return
      }

      self.logger.log(
        "current artwork loaded url=\(artworkUrl) status=\(status) bytes=\(data.count)"
      )

      DispatchQueue.main.async {
        guard self.requestedArtworkUrl == artworkUrl else { return }
        self.loadingArtworkUrl = nil
        self.displayedArtworkUrl = artworkUrl
        self.imageView.image = image
        self.imageView.contentTintColor = nil
      }
    }.resume()
  }

  func setDimmed(_ dimmed: Bool) {
    alphaValue = dimmed ? 0.55 : 1
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
  private var requestedArtworkUrl: String?
  private var loadingArtworkUrl: String?
  private var displayedArtworkUrl: String?

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
      requestedArtworkUrl = nil
      loadingArtworkUrl = nil
      displayedArtworkUrl = nil
      showPlaceholder()
      return
    }

    if artworkUrl == displayedArtworkUrl || artworkUrl == loadingArtworkUrl {
      return
    }
    requestedArtworkUrl = artworkUrl
    loadingArtworkUrl = artworkUrl

    URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard
        let self,
        self.requestedArtworkUrl == artworkUrl,
        let data,
        let image = NSImage(data: data)
      else {
        DispatchQueue.main.async {
          if self?.requestedArtworkUrl == artworkUrl {
            self?.loadingArtworkUrl = nil
            self?.displayedArtworkUrl = nil
            self?.showPlaceholder()
          }
        }
        return
      }

      let mutedImage = self.monochromeImage(from: image) ?? image

      DispatchQueue.main.async {
        guard self.requestedArtworkUrl == artworkUrl else { return }
        self.loadingArtworkUrl = nil
        self.displayedArtworkUrl = artworkUrl
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
  enum Marker {
    case none
    case dot
  }

  var onPress: (() -> Void)?

  private var icon: MenuBarControlIcon
  private let prominent: Bool
  private var active = false
  private var hovering = false
  private var repeatMarker = Marker.none

  init(icon: MenuBarControlIcon, label: String, isProminent: Bool = false) {
    self.icon = icon
    self.prominent = isProminent
    super.init(frame: .zero)

    setAccessibilityElement(true)
    setAccessibilityRole(.button)
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
    layer?.borderWidth = 0
    layer?.borderColor = MenuBarStyle.controlHoverBorder.cgColor
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
        options: [.activeInActiveApp, .inVisibleRect, .mouseEnteredAndExited, .mouseMoved],
        owner: self
      )
    )
  }

  override func mouseEntered(with event: NSEvent) {
    updateHoverState(true)
    super.mouseEntered(with: event)
  }

  override func mouseMoved(with event: NSEvent) {
    updateHoverState(isMouseInsideBounds(event))
    super.mouseMoved(with: event)
  }

  override func mouseExited(with event: NSEvent) {
    updateHoverState(false)
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

  func setHovering(_ hovering: Bool) {
    updateHoverState(hovering)
  }

  func setRepeatMarker(_ repeatMarker: Marker) {
    self.repeatMarker = repeatMarker
    needsDisplay = true
  }

  override func layout() {
    super.layout()
    layer?.cornerRadius = min(bounds.width, bounds.height) / 2
    layer?.shadowPath = CGPath(
      ellipseIn: bounds.insetBy(dx: -2, dy: -2),
      transform: nil
    )
  }

  override func draw(_ dirtyRect: NSRect) {
    super.draw(dirtyRect)
    drawRepeatMarker()
  }

  private func drawRepeatMarker() {
    guard repeatMarker != .none else { return }

    let markerRect = NSRect(
      x: bounds.midX - 5,
      y: bounds.midY - 5,
      width: 10,
      height: 10
    )

    switch repeatMarker {
    case .dot:
      NSColor.white.withAlphaComponent(isEnabled ? 0.92 : 0.48).setFill()
      NSBezierPath(
        ovalIn: markerRect.insetBy(dx: 3.35, dy: 3.35)
      ).fill()
    case .none:
      break
    }
  }

  private func updateAppearance() {
    let background: NSColor
    let showsHoverChrome = isEnabled && (hovering || isHighlighted)
    let shadowOpacity: Float = showsHoverChrome ? (isHighlighted ? 0.42 : 0.34) : 0
    if isHighlighted && isEnabled {
      background = MenuBarStyle.controlPressedBackground
    } else if hovering && isEnabled {
      background = MenuBarStyle.controlHoverBackground
    } else {
      background = .clear
    }

    let tintColor: NSColor
    if prominent || active || hovering {
      if isEnabled {
        tintColor = .white
      } else {
        tintColor = MenuBarStyle.controlInactiveTint
      }
    } else {
      tintColor = MenuBarStyle.controlInactiveTint
    }

    alphaValue = isEnabled ? 1 : 0.35
    contentTintColor = tintColor
    layer?.backgroundColor = background.cgColor
    layer?.borderWidth = showsHoverChrome ? 1 : 0
    layer?.borderColor = MenuBarStyle.controlHoverBorder.cgColor
    layer?.shadowColor = MenuBarStyle.controlHoverShadow.cgColor
    layer?.shadowOpacity = shadowOpacity
    layer?.shadowRadius = isHighlighted ? 12 : 10
  }

  private func updateHoverState(_ isHovering: Bool) {
    guard hovering != isHovering else { return }
    hovering = isHovering
    updateAppearance()
  }

  private func isMouseInsideBounds(_ event: NSEvent) -> Bool {
    bounds.contains(convert(event.locationInWindow, from: nil))
  }

  @objc private func performPress() {
    onPress?()
  }
}
