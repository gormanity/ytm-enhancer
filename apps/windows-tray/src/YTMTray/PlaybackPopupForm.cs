using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal sealed class PlaybackPopupForm : Form
{
    private static readonly Color SurfaceColor = Color.FromArgb(8, 8, 9);
    private static readonly Color BorderColor = Color.FromArgb(88, 88, 94);
    private static readonly Color DividerColor = Color.FromArgb(58, 58, 62);
    private static readonly Color PrimaryTextColor = Color.White;
    private static readonly Color SecondaryTextColor = Color.FromArgb(202, 202, 208);
    private static readonly Color TertiaryTextColor = Color.FromArgb(145, 145, 152);
    private static readonly Color AccentColor = Color.FromArgb(255, 32, 18);
    private static readonly Color WarningColor = Color.FromArgb(255, 158, 61);
    private static readonly Color SurfaceHighlightColor = Color.FromArgb(18, 255, 255, 255);

    private readonly ArtworkBoxControl currentArtwork = new(10);
    private readonly Label statusLabel = new();
    private readonly ScrollingLabelControl titleLabel = new();
    private readonly ScrollingLabelControl albumLabel = new();
    private readonly ScrollingLabelControl artistYearLabel = new();
    private readonly Label elapsedLabel = new();
    private readonly Label durationLabel = new();
    private readonly SeekBarControl progressBar = new();
    private readonly ToolTip controlTips = new();
    private readonly StatusMessageControl controlStatus = new();
    private readonly CloseButtonControl closeButton = new();
    private readonly PlaybackButtonControl shuffleButton = new(PlaybackButtonIcon.Shuffle, "Shuffle");
    private readonly PlaybackButtonControl previousButton = new(
        PlaybackButtonIcon.Previous,
        "Previous"
    );
    private readonly PlaybackButtonControl toggleButton = new(PlaybackButtonIcon.Play, "Play");
    private readonly PlaybackButtonControl nextButton = new(PlaybackButtonIcon.Next, "Next");
    private readonly PlaybackButtonControl repeatButton = new(PlaybackButtonIcon.Repeat, "Repeat");
    private readonly Label nextSectionLabel = new();
    private readonly ArtworkBoxControl nextArtwork = new(8);
    private readonly ScrollingLabelControl nextTitleLabel = new();
    private readonly ScrollingLabelControl nextDetailLabel = new();
    private readonly PopupActionRowControl focusRow = new(
        PopupActionIcon.Focus,
        "Focus YouTube Music"
    );
    private readonly PopupActionRowControl updateRow = new(
        PopupActionIcon.Update,
        "Check for Updates"
    );
    private readonly PopupActionRowControl aboutRow = new(PopupActionIcon.Info, "About YTM Tray");
    private readonly PopupActionRowControl quitRow = new(PopupActionIcon.Quit, "Quit");
    private readonly NativeAppLogger? logger;
    private readonly bool scrollDiagnosticsEnabled;
    private double currentDuration;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnShuffle { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnPrevious { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnTogglePlay { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnNext { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnRepeat { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action<double>? OnSeek { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnFocusYouTubeMusic { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnCheckForUpdates { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnAbout { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnQuit { get; set; }

    public PlaybackPopupForm(NativeAppLogger? logger = null)
    {
        this.logger = logger;
        scrollDiagnosticsEnabled =
            Environment.GetEnvironmentVariable("YTM_TRAY_SCROLL_QA") == "1";

        FormBorderStyle = FormBorderStyle.None;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        Text = "YTM Tray";
        AccessibleName = "YTM Tray";
        BackColor = SurfaceColor;
        ForeColor = PrimaryTextColor;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        ClientSize = new Size(440, 570);
        DoubleBuffered = true;

        ConfigureCurrentTrack();
        ConfigureProgress();
        ConfigureButtons();
        ConfigureNextTrack();
        ConfigureActionRows();
        UpdateWindowRegion();
    }

    public void UpdateConnectionStatus(string status)
    {
        var isNeutral = IsNeutralConnectionStatus(status);
        statusLabel.Text = isNeutral ? CompactStatus(status) : "";
        statusLabel.ForeColor = TertiaryTextColor;
        titleLabel.Text = "YTM Enhancer";
        albumLabel.Text = "";
        artistYearLabel.Text = "";
        artistYearLabel.ForeColor = TertiaryTextColor;
        currentArtwork.SetArtworkUrl(null);
        currentDuration = 0;
        UpdateProgress(0, 0);
        UpdateNextTrack(null);
        ShowControlStatus(status, ControlStatusTextColor(status), !isNeutral);
        SetControlsEnabled(false);
    }

    public void SetStalePlaybackState()
    {
        statusLabel.Text = "";
        statusLabel.ForeColor = WarningColor;
        artistYearLabel.Text = "";
        artistYearLabel.ForeColor = TertiaryTextColor;
        ShowControlStatus("Waiting for playback updates...", WarningColor, true);
        SetControlsEnabled(false);
    }

    public void UpdatePlayback(PlaybackState state)
    {
        var hasTrack = !string.IsNullOrWhiteSpace(state.Title);

        statusLabel.Text = state.IsPlaying ? "Playing" : "Paused";
        statusLabel.ForeColor = TertiaryTextColor;
        titleLabel.Text = hasTrack ? state.Title! : "No track loaded";
        albumLabel.Text = state.Album ?? "";
        artistYearLabel.Text = FormatArtistYearLine(state);
        artistYearLabel.ForeColor = TertiaryTextColor;
        currentArtwork.SetArtworkUrl(state.ArtworkUrl);
        toggleButton.ButtonIcon = state.IsPlaying
            ? PlaybackButtonIcon.Pause
            : PlaybackButtonIcon.Play;
        toggleButton.AccessibleName = state.IsPlaying ? "Pause" : "Play";
        controlTips.SetToolTip(toggleButton, state.IsPlaying ? "Pause" : "Play");
        shuffleButton.Active = state.IsShuffling == true;
        repeatButton.ButtonIcon = RepeatButtonIcon(state.RepeatMode);
        repeatButton.Active = (state.RepeatMode ?? "off") != "off";
        currentDuration = Math.Max(0, state.Duration);
        UpdateProgress(state.Progress, state.Duration);
        UpdateNextTrack(state.NextTrack);
        if (hasTrack)
        {
            HideControlStatus();
        }
        else
        {
            ShowControlStatus("No track loaded", SecondaryTextColor);
        }
        SetControlsEnabled(hasTrack);
    }

    public void SetUpdateAvailable(string? version)
    {
        updateRow.Text = string.IsNullOrWhiteSpace(version)
            ? "Check for Updates"
            : $"Install Update {version}";
        updateRow.AccessibleName = updateRow.Text;
        updateRow.Invalidate();
    }

    protected override void OnResize(EventArgs e)
    {
        base.OnResize(e);
        UpdateWindowRegion();
        Invalidate();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        using var surfaceBrush = new SolidBrush(SurfaceColor);
        using var highlightBrush = new LinearGradientBrush(
            new Rectangle(0, 0, ClientSize.Width, 180),
            SurfaceHighlightColor,
            Color.Transparent,
            LinearGradientMode.Vertical
        );
        using var borderPen = new Pen(BorderColor);
        using var dividerPen = new Pen(DividerColor);
        using var surfacePath = RoundedRectangle(
            new Rectangle(0, 0, ClientSize.Width - 1, ClientSize.Height - 1),
            18
        );

        e.Graphics.FillPath(surfaceBrush, surfacePath);
        e.Graphics.FillPath(highlightBrush, surfacePath);
        e.Graphics.DrawPath(borderPen, surfacePath);
        e.Graphics.DrawLine(dividerPen, 32, 294, ClientSize.Width - 32, 294);
        e.Graphics.DrawLine(dividerPen, 32, 426, ClientSize.Width - 32, 426);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            controlTips.Dispose();
        }

        base.Dispose(disposing);
    }

    private void ConfigureCurrentTrack()
    {
        currentArtwork.SetBounds(32, 32, 92, 92);

        statusLabel.SetBounds(316, 18, 76, 20);
        statusLabel.Font = new Font(Font.FontFamily, 7.5f, FontStyle.Regular);
        statusLabel.ForeColor = TertiaryTextColor;
        statusLabel.BackColor = Color.Transparent;
        statusLabel.TextAlign = ContentAlignment.MiddleRight;
        statusLabel.AutoEllipsis = true;

        titleLabel.SetBounds(148, 34, 244, 34);
        titleLabel.Font = new Font(Font.FontFamily, 16.5f, FontStyle.Bold);
        titleLabel.ForeColor = PrimaryTextColor;
        titleLabel.BackColor = Color.Transparent;
        titleLabel.ScrollDiagnosticName = "title";

        albumLabel.SetBounds(148, 74, 244, 24);
        albumLabel.Font = new Font(Font.FontFamily, 11.5f, FontStyle.Bold);
        albumLabel.ForeColor = SecondaryTextColor;
        albumLabel.BackColor = Color.Transparent;
        albumLabel.ScrollDiagnosticName = "album";

        artistYearLabel.SetBounds(148, 102, 244, 22);
        artistYearLabel.Font = new Font(Font.FontFamily, 10.25f, FontStyle.Bold);
        artistYearLabel.ForeColor = TertiaryTextColor;
        artistYearLabel.BackColor = Color.Transparent;
        artistYearLabel.ScrollDiagnosticName = "artist-year";

        closeButton.SetBounds(402, 16, 24, 24);
        closeButton.Pressed += (_, _) => Hide();
        RegisterScrollDiagnostics(titleLabel, albumLabel, artistYearLabel);

        Controls.AddRange([
            currentArtwork,
            statusLabel,
            titleLabel,
            albumLabel,
            artistYearLabel,
            closeButton
        ]);
    }

    private void ConfigureProgress()
    {
        progressBar.SetBounds(32, 154, 376, 20);
        progressBar.AccentColor = AccentColor;
        progressBar.UserSeekRequested += (_, _) =>
        {
            if (currentDuration <= 0) return;
            var time = currentDuration * progressBar.Value / progressBar.Maximum;
            OnSeek?.Invoke(time);
        };

        elapsedLabel.SetBounds(32, 178, 92, 22);
        elapsedLabel.Font = new Font(Font.FontFamily, 10f, FontStyle.Bold);
        elapsedLabel.ForeColor = TertiaryTextColor;
        elapsedLabel.BackColor = Color.Transparent;

        durationLabel.SetBounds(316, 178, 92, 22);
        durationLabel.Font = new Font(Font.FontFamily, 10f, FontStyle.Bold);
        durationLabel.ForeColor = TertiaryTextColor;
        durationLabel.BackColor = Color.Transparent;
        durationLabel.TextAlign = ContentAlignment.MiddleRight;

        Controls.AddRange([progressBar, elapsedLabel, durationLabel]);
    }

    private void ConfigureButtons()
    {
        controlStatus.SetBounds(32, 200, 376, 94);
        controlStatus.Font = new Font(Font.FontFamily, 11.5f, FontStyle.Bold);
        controlStatus.MessageColor = SecondaryTextColor;
        controlStatus.BackColor = Color.Transparent;
        controlStatus.Visible = false;
        Controls.Add(controlStatus);

        ConfigureButton(shuffleButton, 78, 220, 44, () => OnShuffle?.Invoke());
        ConfigureButton(previousButton, 145, 216, 50, () => OnPrevious?.Invoke(), true);
        ConfigureButton(toggleButton, 207, 209, 64, () => OnTogglePlay?.Invoke(), true);
        ConfigureButton(nextButton, 286, 216, 50, () => OnNext?.Invoke(), true);
        ConfigureButton(repeatButton, 354, 220, 44, () => OnRepeat?.Invoke());
    }

    private void ConfigureButton(
        PlaybackButtonControl button,
        int x,
        int y,
        int size,
        Action action,
        bool prominent = false
    )
    {
        button.SetBounds(x, y, size, size);
        button.BackColor = Color.Transparent;
        button.Prominent = prominent;
        button.Pressed += (_, _) => action();
        controlTips.SetToolTip(button, button.AccessibleName);
        Controls.Add(button);
    }

    private void ConfigureNextTrack()
    {
        nextSectionLabel.SetBounds(32, 318, 120, 22);
        nextSectionLabel.Text = "Up Next";
        nextSectionLabel.Font = new Font(Font.FontFamily, 10.5f, FontStyle.Bold);
        nextSectionLabel.ForeColor = TertiaryTextColor;
        nextSectionLabel.BackColor = Color.Transparent;

        nextArtwork.SetBounds(32, 354, 54, 54);

        nextTitleLabel.SetBounds(104, 352, 304, 26);
        nextTitleLabel.Font = new Font(Font.FontFamily, 11.5f, FontStyle.Bold);
        nextTitleLabel.ForeColor = SecondaryTextColor;
        nextTitleLabel.BackColor = Color.Transparent;
        nextTitleLabel.ScrollDiagnosticName = "next-title";

        nextDetailLabel.SetBounds(104, 381, 304, 22);
        nextDetailLabel.Font = new Font(Font.FontFamily, 10f, FontStyle.Regular);
        nextDetailLabel.ForeColor = TertiaryTextColor;
        nextDetailLabel.BackColor = Color.Transparent;
        nextDetailLabel.ScrollDiagnosticName = "next-detail";
        RegisterScrollDiagnostics(nextTitleLabel, nextDetailLabel);

        Controls.AddRange([nextSectionLabel, nextArtwork, nextTitleLabel, nextDetailLabel]);
    }

    private void RegisterScrollDiagnostics(params ScrollingLabelControl[] labels)
    {
        if (!scrollDiagnosticsEnabled) return;

        foreach (var label in labels)
        {
            label.ScrollAdvanced += (_, _) =>
                logger?.Log(
                    $"metadata scroll advanced label={label.ScrollDiagnosticName} distance={label.ScrollDistance:0.0}"
                );
        }
    }

    private void ConfigureActionRows()
    {
        ConfigureActionRow(focusRow, 446, () => OnFocusYouTubeMusic?.Invoke());
        ConfigureActionRow(updateRow, 476, () => OnCheckForUpdates?.Invoke());
        ConfigureActionRow(aboutRow, 506, () => OnAbout?.Invoke());
        ConfigureActionRow(quitRow, 536, () => OnQuit?.Invoke());
    }

    private void ConfigureActionRow(PopupActionRowControl row, int y, Action action)
    {
        row.SetBounds(32, y, 376, 28);
        row.BackColor = Color.Transparent;
        row.Pressed += (_, _) => action();
        Controls.Add(row);
    }

    private void SetControlsEnabled(bool enabled)
    {
        foreach (var control in new Control[]
                 {
                     progressBar,
                     shuffleButton,
                     previousButton,
                     toggleButton,
                     nextButton,
                     repeatButton
                 })
        {
            control.Enabled = enabled;
        }

        var playbackButtons = new[]
        {
            shuffleButton,
            previousButton,
            toggleButton,
            nextButton,
            repeatButton
        };

        foreach (var button in playbackButtons)
        {
            button.PlaybackEnabled = enabled;
        }
    }

    private void ShowControlStatus(
        string message,
        Color textColor,
        bool showWarningIcon = false
    )
    {
        controlStatus.Message = message;
        controlStatus.MessageColor = textColor;
        controlStatus.ShowWarningIcon = showWarningIcon;
        controlStatus.Visible = !string.IsNullOrWhiteSpace(message);
        SetPlaybackButtonsVisible(false);
    }

    private void HideControlStatus()
    {
        controlStatus.Message = "";
        controlStatus.Visible = false;
        SetPlaybackButtonsVisible(true);
    }

    private void SetPlaybackButtonsVisible(bool visible)
    {
        foreach (var button in new Control[]
                 {
                     shuffleButton,
                     previousButton,
                     toggleButton,
                     nextButton,
                     repeatButton
                 })
        {
            button.Visible = visible;
        }
    }

    private void UpdateProgress(double progress, double duration)
    {
        var value = duration <= 0 ? 0 : (int)Math.Round(progress / duration * progressBar.Maximum);
        progressBar.Value = Math.Clamp(value, progressBar.Minimum, progressBar.Maximum);
        elapsedLabel.Text = duration <= 0 ? "" : FormatTime(progress);
        durationLabel.Text = duration <= 0 ? "" : FormatTime(duration);
    }

    private void UpdateNextTrack(TrackMetadata? track)
    {
        if (track is null)
        {
            nextTitleLabel.Text = "No upcoming track";
            nextDetailLabel.Text = "";
            nextArtwork.SetArtworkUrl(null);
            return;
        }

        nextTitleLabel.Text = string.IsNullOrWhiteSpace(track.Title)
            ? "Unknown track"
            : track.Title;
        nextDetailLabel.Text = track.Artist ?? "";
        nextArtwork.SetArtworkUrl(track.ArtworkUrl);
    }

    private void UpdateWindowRegion()
    {
        if (ClientSize.Width <= 0 || ClientSize.Height <= 0) return;

        using var regionPath = RoundedRectangle(
            new Rectangle(0, 0, ClientSize.Width, ClientSize.Height),
            18
        );
        var previousRegion = Region;
        Region = new Region(regionPath);
        previousRegion?.Dispose();
    }

    private static string FormatArtistYearLine(PlaybackState state)
    {
        var parts = new[] { state.Artist, state.Year?.ToString() }
            .Where(part => !string.IsNullOrWhiteSpace(part));
        return string.Join(" - ", parts);
    }

    private static PlaybackButtonIcon RepeatButtonIcon(string? repeatMode) =>
        repeatMode == "one" ? PlaybackButtonIcon.RepeatOne : PlaybackButtonIcon.Repeat;

    private static Color ControlStatusTextColor(string status) =>
        IsNeutralConnectionStatus(status) ? SecondaryTextColor : WarningColor;

    private static bool IsNeutralConnectionStatus(string status) =>
        status == "Connecting" || status == "Connected";

    private static string CompactStatus(string status)
    {
        if (status.Contains("Waiting", StringComparison.OrdinalIgnoreCase))
        {
            return "Waiting";
        }

        if (status.Contains("No YouTube Music", StringComparison.OrdinalIgnoreCase))
        {
            return "No tab";
        }

        return status.Length <= 14 ? status : "Unavailable";
    }

    private static string FormatTime(double seconds)
    {
        var time = TimeSpan.FromSeconds(Math.Max(0, seconds));
        return time.TotalHours >= 1
            ? $"{(int)time.TotalHours}:{time.Minutes:00}:{time.Seconds:00}"
            : $"{time.Minutes}:{time.Seconds:00}";
    }

    internal static GraphicsPath RoundedRectangle(Rectangle bounds, int radius)
    {
        var diameter = Math.Min(radius * 2, Math.Min(bounds.Width, bounds.Height));
        var path = new GraphicsPath();
        path.AddArc(bounds.X, bounds.Y, diameter, diameter, 180, 90);
        path.AddArc(bounds.Right - diameter, bounds.Y, diameter, diameter, 270, 90);
        path.AddArc(bounds.Right - diameter, bounds.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(bounds.X, bounds.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }
}

internal sealed class CloseButtonControl : Control
{
    private static readonly Color IconColor = Color.FromArgb(166, 166, 174);
    private static readonly Color HoverColor = Color.FromArgb(34, 255, 255, 255);
    private static readonly Color PressedColor = Color.FromArgb(48, 255, 255, 255);

    private bool hovering;
    private bool pressing;

    public CloseButtonControl()
    {
        AccessibleName = "Close";
        AccessibleRole = AccessibleRole.PushButton;
        Cursor = Cursors.Hand;
        TabStop = false;
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );
        BackColor = Color.Transparent;
    }

    public event EventHandler? Pressed;

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        hovering = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        hovering = false;
        pressing = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left) return;
        pressing = true;
        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!pressing || e.Button != MouseButtons.Left) return;

        pressing = false;
        Invalidate();

        if (ClientRectangle.Contains(e.Location))
        {
            Pressed?.Invoke(this, EventArgs.Empty);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (hovering || pressing)
        {
            using var backgroundBrush = new SolidBrush(pressing ? PressedColor : HoverColor);
            e.Graphics.FillEllipse(backgroundBrush, 1, 1, Width - 2, Height - 2);
        }

        using var pen = new Pen(IconColor, 1.4f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        e.Graphics.DrawLine(pen, 8, 8, Width - 8, Height - 8);
        e.Graphics.DrawLine(pen, Width - 8, 8, 8, Height - 8);
    }
}

internal sealed class StatusMessageControl : Control
{
    private static readonly Color IconInteriorColor = Color.FromArgb(8, 8, 9);
    private string message = "";
    private Color messageColor = Color.FromArgb(202, 202, 208);
    private bool showWarningIcon;

    public StatusMessageControl()
    {
        AccessibleRole = AccessibleRole.StaticText;
        TabStop = false;
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );
        BackColor = Color.Transparent;
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string Message
    {
        get => message;
        set
        {
            var nextMessage = value ?? "";
            if (message == nextMessage) return;
            message = nextMessage;
            AccessibleName = nextMessage;
            Invalidate();
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Color MessageColor
    {
        get => messageColor;
        set
        {
            if (messageColor == value) return;
            messageColor = value;
            Invalidate();
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool ShowWarningIcon
    {
        get => showWarningIcon;
        set
        {
            if (showWarningIcon == value) return;
            showWarningIcon = value;
            Invalidate();
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        if (string.IsNullOrWhiteSpace(message)) return;

        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        const int iconSize = 14;
        const int iconGap = 8;
        var iconWidth = showWarningIcon ? iconSize + iconGap : 0;
        var maxTextWidth = Math.Max(0, Width - iconWidth);
        var textFlags =
            TextFormatFlags.NoPadding
            | TextFormatFlags.NoPrefix
            | TextFormatFlags.WordBreak
            | TextFormatFlags.VerticalCenter;
        var measuredTextSize = TextRenderer.MeasureText(
            e.Graphics,
            message,
            Font,
            new Size(maxTextWidth, Height),
            textFlags
        );
        var visibleTextWidth = Math.Min(maxTextWidth, measuredTextSize.Width);
        var textWidth = Math.Min(maxTextWidth, visibleTextWidth + 12);
        var textHeight = Math.Min(Height, measuredTextSize.Height);
        var visibleGroupWidth = iconWidth + visibleTextWidth;
        var startX = (Width - visibleGroupWidth) / 2;
        var textX = showWarningIcon ? startX + iconSize + iconGap : startX;
        var textBounds = new Rectangle(
            textX,
            (Height - textHeight) / 2,
            textWidth,
            textHeight
        );

        if (showWarningIcon)
        {
            var iconBounds = new Rectangle(startX, (Height - iconSize) / 2, iconSize, iconSize);
            DrawWarningIcon(e.Graphics, iconBounds);
        }

        TextRenderer.DrawText(
            e.Graphics,
            message,
            Font,
            textBounds,
            messageColor,
            textFlags | (showWarningIcon ? TextFormatFlags.Left : TextFormatFlags.HorizontalCenter)
        );
    }

    private void DrawWarningIcon(Graphics graphics, Rectangle bounds)
    {
        var points = new[]
        {
            new PointF(bounds.Left + bounds.Width / 2f, bounds.Top + 1),
            new PointF(bounds.Right - 1, bounds.Bottom - 1),
            new PointF(bounds.Left + 1, bounds.Bottom - 1)
        };

        using var fillBrush = new SolidBrush(messageColor);
        using var interiorPen = new Pen(IconInteriorColor, 1.6f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        using var interiorBrush = new SolidBrush(IconInteriorColor);

        graphics.FillPolygon(fillBrush, points);
        graphics.DrawLine(
            interiorPen,
            bounds.Left + bounds.Width / 2f,
            bounds.Top + 5,
            bounds.Left + bounds.Width / 2f,
            bounds.Bottom - 5
        );
        graphics.FillEllipse(
            interiorBrush,
            bounds.Left + bounds.Width / 2f - 1,
            bounds.Bottom - 3,
            2,
            2
        );
    }
}

internal sealed class ScrollingLabelControl : Control
{
    private const int ScrollLoopGap = 32;
    private const int ScrollPauseMilliseconds = 1250;
    private const int FrameMilliseconds = 16;

    private readonly System.Windows.Forms.Timer pauseTimer = new()
    {
        Interval = ScrollPauseMilliseconds
    };
    private readonly System.Windows.Forms.Timer scrollTimer = new()
    {
        Interval = FrameMilliseconds
    };
    private DateTime scrollStartTime;
    private float scrollOffset;
    private int measuredTextWidth = -1;
    private bool reportedScrollAdvance;

    public ScrollingLabelControl()
    {
        AccessibleRole = AccessibleRole.StaticText;
        TabStop = false;
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );

        pauseTimer.Tick += (_, _) =>
        {
            pauseTimer.Stop();
            StartScrollLoop();
        };
        scrollTimer.Tick += (_, _) => AdvanceScroll();
    }

    public event EventHandler? ScrollAdvanced;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public string ScrollDiagnosticName { get; set; } = "metadata";

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public float ScrollDistance => NeedsScroll ? TextWidth + ScrollLoopGap : 0;

    [AllowNull]
    public override string Text
    {
        get => base.Text;
        set
        {
            var nextText = value ?? "";
            if (base.Text == nextText) return;
            base.Text = nextText;
            AccessibleName = nextText;
            ResetScroll();
        }
    }

    protected override void OnFontChanged(EventArgs e)
    {
        base.OnFontChanged(e);
        ResetScroll();
    }

    protected override void OnForeColorChanged(EventArgs e)
    {
        base.OnForeColorChanged(e);
        Invalidate();
    }

    protected override void OnSizeChanged(EventArgs e)
    {
        base.OnSizeChanged(e);
        ResetScroll();
    }

    protected override void OnVisibleChanged(EventArgs e)
    {
        base.OnVisibleChanged(e);
        ResetScroll();
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);

        if (string.IsNullOrEmpty(Text)) return;

        ScheduleScrollIfNeeded();

        var flags =
            TextFormatFlags.NoPadding
            | TextFormatFlags.SingleLine
            | TextFormatFlags.VerticalCenter
            | TextFormatFlags.NoPrefix;

        if (!NeedsScroll)
        {
            TextRenderer.DrawText(
                e.Graphics,
                Text,
                Font,
                ClientRectangle,
                ForeColor,
                flags | TextFormatFlags.EndEllipsis
            );
            return;
        }

        var textHeight = TextRenderer.MeasureText(Text, Font, Size.Empty, flags).Height;
        var y = Math.Max(0, (Height - textHeight) / 2);
        var firstBounds = new Rectangle(
            (int)Math.Round(-scrollOffset),
            y,
            TextWidth + 2,
            Height
        );
        var secondBounds = new Rectangle(
            (int)Math.Round(-scrollOffset + TextWidth + ScrollLoopGap),
            y,
            TextWidth + 2,
            Height
        );
        using var previousClip = e.Graphics.Clip.Clone();
        e.Graphics.SetClip(ClientRectangle);
        try
        {
            TextRenderer.DrawText(e.Graphics, Text, Font, firstBounds, ForeColor, flags);
            TextRenderer.DrawText(e.Graphics, Text, Font, secondBounds, ForeColor, flags);
        }
        finally
        {
            e.Graphics.SetClip(previousClip, CombineMode.Replace);
        }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            pauseTimer.Dispose();
            scrollTimer.Dispose();
        }

        base.Dispose(disposing);
    }

    private bool NeedsScroll => Width > 0 && TextWidth > Width + 4;

    private int TextWidth
    {
        get
        {
            if (measuredTextWidth >= 0) return measuredTextWidth;

            var flags =
                TextFormatFlags.NoPadding
                | TextFormatFlags.SingleLine
                | TextFormatFlags.NoPrefix;
            measuredTextWidth = TextRenderer.MeasureText(Text, Font, Size.Empty, flags).Width;
            return measuredTextWidth;
        }
    }

    private void ResetScroll()
    {
        pauseTimer.Stop();
        scrollTimer.Stop();
        scrollOffset = 0;
        measuredTextWidth = -1;
        reportedScrollAdvance = false;
        Invalidate();

        ScheduleScrollIfNeeded();
    }

    private void ScheduleScrollIfNeeded()
    {
        if (
            !IsHandleCreated
            || !Visible
            || !NeedsScroll
            || pauseTimer.Enabled
            || scrollTimer.Enabled
        )
        {
            return;
        }

        pauseTimer.Start();
    }

    private void StartScrollLoop()
    {
        if (!Visible || !NeedsScroll) return;

        scrollOffset = 0;
        reportedScrollAdvance = false;
        scrollStartTime = DateTime.UtcNow;
        scrollTimer.Start();
    }

    private void AdvanceScroll()
    {
        if (!Visible || !NeedsScroll)
        {
            scrollTimer.Stop();
            return;
        }

        var durationSeconds = Math.Min(8, Math.Max(1.4, ScrollDistance / 32.0));
        var elapsedSeconds = (DateTime.UtcNow - scrollStartTime).TotalSeconds;
        var progress = Math.Min(1, elapsedSeconds / durationSeconds);
        scrollOffset = ScrollDistance * (float)progress;

        if (!reportedScrollAdvance && progress >= 0.08)
        {
            reportedScrollAdvance = true;
            ScrollAdvanced?.Invoke(this, EventArgs.Empty);
        }

        Invalidate();

        if (progress < 1) return;

        scrollTimer.Stop();
        pauseTimer.Start();
    }
}

internal sealed class ArtworkBoxControl : Control
{
    private static readonly Color BackgroundColor = Color.FromArgb(28, 28, 31);
    private static readonly Color BorderColor = Color.FromArgb(68, 68, 74);
    private static readonly Color PlaceholderColor = Color.FromArgb(138, 138, 146);
    private static readonly HttpClient HttpClient = new();

    private readonly int cornerRadius;
    private Image? artwork;
    private string? requestedArtworkUrl;

    public ArtworkBoxControl(int cornerRadius)
    {
        this.cornerRadius = cornerRadius;
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );
        BackColor = Color.Transparent;
    }

    public void SetArtworkUrl(string? artworkUrl)
    {
        if (!IsSupportedArtworkUrl(artworkUrl))
        {
            requestedArtworkUrl = null;
            ReplaceArtwork(null);
            return;
        }

        if (requestedArtworkUrl == artworkUrl) return;

        requestedArtworkUrl = artworkUrl;
        ReplaceArtwork(null);
        _ = LoadArtworkAsync(artworkUrl!);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        using var backgroundBrush = new SolidBrush(BackgroundColor);
        using var borderPen = new Pen(BorderColor);
        using var boundsPath = PlaybackPopupForm.RoundedRectangle(
            new Rectangle(0, 0, Width - 1, Height - 1),
            cornerRadius
        );

        e.Graphics.FillPath(backgroundBrush, boundsPath);

        if (artwork is not null)
        {
            using var imagePath = PlaybackPopupForm.RoundedRectangle(
                new Rectangle(1, 1, Width - 2, Height - 2),
                cornerRadius - 1
            );
            var graphicsState = e.Graphics.Save();
            e.Graphics.SetClip(imagePath);
            e.Graphics.DrawImage(artwork, new Rectangle(1, 1, Width - 2, Height - 2));
            e.Graphics.Restore(graphicsState);
        }
        else
        {
            var graphicsState = e.Graphics.Save();
            e.Graphics.SetClip(boundsPath);
            DrawPlaceholder(e.Graphics);
            e.Graphics.Restore(graphicsState);
        }

        e.Graphics.DrawPath(borderPen, boundsPath);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            artwork?.Dispose();
        }

        base.Dispose(disposing);
    }

    private async Task LoadArtworkAsync(string artworkUrl)
    {
        try
        {
            var bytes = await HttpClient.GetByteArrayAsync(artworkUrl);
            using var stream = new MemoryStream(bytes);
            using var loadedImage = Image.FromStream(stream);
            var nextArtwork = new Bitmap(loadedImage);

            if (IsDisposed || !IsHandleCreated)
            {
                nextArtwork.Dispose();
                return;
            }

            BeginInvoke(
                (MethodInvoker)(() =>
                {
                    if (requestedArtworkUrl != artworkUrl)
                    {
                        nextArtwork.Dispose();
                        return;
                    }

                    ReplaceArtwork(nextArtwork);
                })
            );
        }
        catch
        {
            if (!IsDisposed && IsHandleCreated)
            {
                BeginInvoke(
                    (MethodInvoker)(() =>
                    {
                        if (requestedArtworkUrl == artworkUrl)
                        {
                            ReplaceArtwork(null);
                        }
                    })
                );
            }
        }
    }

    private void ReplaceArtwork(Image? nextArtwork)
    {
        var previousArtwork = artwork;
        artwork = nextArtwork;
        previousArtwork?.Dispose();
        Invalidate();
    }

    private void DrawPlaceholder(Graphics graphics)
    {
        using var albumBrush = new LinearGradientBrush(
            new Rectangle(0, 0, Math.Max(1, Width), Math.Max(1, Height)),
            Color.FromArgb(238, 151, 116),
            Color.FromArgb(34, 86, 94),
            LinearGradientMode.ForwardDiagonal
        );
        using var sunBrush = new SolidBrush(Color.FromArgb(168, 255, 183, 121));
        using var hazeBrush = new SolidBrush(Color.FromArgb(72, 255, 255, 255));
        using var wavePen = new Pen(Color.FromArgb(82, 255, 255, 255), Math.Max(1, Height / 42f))
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        using var pen = new Pen(PlaceholderColor, Math.Max(2, Width / 18f))
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round
        };
        using var brush = new SolidBrush(Color.FromArgb(196, 240, 240, 245));

        graphics.FillRectangle(albumBrush, 0, 0, Width, Height);
        graphics.FillEllipse(
            sunBrush,
            Width * 0.22f,
            Height * 0.18f,
            Width * 0.56f,
            Height * 0.56f
        );
        graphics.FillRectangle(hazeBrush, 0, Height * 0.56f, Width, Height * 0.44f);
        graphics.DrawBezier(
            wavePen,
            Width * 0.08f,
            Height * 0.66f,
            Width * 0.28f,
            Height * 0.56f,
            Width * 0.52f,
            Height * 0.74f,
            Width * 0.92f,
            Height * 0.61f
        );
        graphics.DrawBezier(
            wavePen,
            Width * 0.03f,
            Height * 0.77f,
            Width * 0.28f,
            Height * 0.68f,
            Width * 0.58f,
            Height * 0.88f,
            Width * 0.98f,
            Height * 0.72f
        );

        var stemX = Width * 0.57f;
        var topY = Height * 0.26f;
        var bottomY = Height * 0.62f;
        graphics.DrawLine(pen, stemX, topY, stemX, bottomY);
        graphics.DrawLine(pen, stemX, topY, Width * 0.74f, topY + Height * 0.08f);
        graphics.FillEllipse(
            brush,
            Width * 0.29f,
            Height * 0.55f,
            Width * 0.22f,
            Height * 0.18f
        );
    }

    private static bool IsSupportedArtworkUrl(string? artworkUrl)
    {
        if (string.IsNullOrWhiteSpace(artworkUrl)) return false;
        if (!Uri.TryCreate(artworkUrl, UriKind.Absolute, out var uri)) return false;
        return uri.Scheme is "http" or "https";
    }
}

internal enum PlaybackButtonIcon
{
    Shuffle,
    Previous,
    Play,
    Pause,
    Next,
    Repeat,
    RepeatOne
}

internal sealed class PlaybackButtonControl : Control
{
    private static readonly Color HoverColor = Color.FromArgb(42, 255, 255, 255);
    private static readonly Color PressedColor = Color.FromArgb(58, 255, 255, 255);
    private static readonly Color IconColor = Color.White;
    private static readonly Color IconInactiveColor = Color.FromArgb(132, 132, 138);
    private static readonly Color IconDisabledColor = Color.FromArgb(92, 92, 98);

    private bool hovering;
    private bool pressing;
    private PlaybackButtonIcon buttonIcon;
    private bool playbackEnabled;
    private bool prominent;
    private bool active;

    public PlaybackButtonControl(PlaybackButtonIcon buttonIcon, string accessibleName)
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );

        this.buttonIcon = buttonIcon;
        playbackEnabled = false;
        AccessibleName = accessibleName;
        AccessibleRole = AccessibleRole.PushButton;
        BackColor = Color.Transparent;
        Cursor = Cursors.Default;
        TabStop = false;
    }

    public event EventHandler? Pressed;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public PlaybackButtonIcon ButtonIcon
    {
        get => buttonIcon;
        set
        {
            if (buttonIcon == value) return;
            buttonIcon = value;
            Invalidate();
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool PlaybackEnabled
    {
        get => playbackEnabled;
        set
        {
            if (playbackEnabled == value) return;
            playbackEnabled = value;
            hovering = false;
            pressing = false;
            Cursor = playbackEnabled ? Cursors.Hand : Cursors.Default;
            Invalidate();
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool Prominent
    {
        get => prominent;
        set
        {
            if (prominent == value) return;
            prominent = value;
            Invalidate();
        }
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public bool Active
    {
        get => active;
        set
        {
            if (active == value) return;
            active = value;
            Invalidate();
        }
    }

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        if (!playbackEnabled) return;
        hovering = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        hovering = false;
        pressing = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (!playbackEnabled || e.Button != MouseButtons.Left) return;
        pressing = true;
        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!pressing || e.Button != MouseButtons.Left) return;

        pressing = false;
        Invalidate();

        if (ClientRectangle.Contains(e.Location))
        {
            Pressed?.Invoke(this, EventArgs.Empty);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (hovering || pressing)
        {
            using var backgroundBrush = new SolidBrush(pressing ? PressedColor : HoverColor);
            e.Graphics.FillEllipse(backgroundBrush, 2, 2, Width - 4, Height - 4);
        }

        var iconColor = IconPaintColor();
        var iconSize = IconSize();
        var iconBounds = new Rectangle(
            (Width - iconSize) / 2,
            (Height - iconSize) / 2,
            iconSize,
            iconSize
        );
        PlaybackSvgIconRenderer.Draw(e.Graphics, buttonIcon, iconBounds, iconColor);
    }

    private Color IconPaintColor()
    {
        if (!playbackEnabled) return IconDisabledColor;
        if (prominent || active) return IconColor;
        return IconInactiveColor;
    }

    private int IconSize() =>
        buttonIcon switch
        {
            PlaybackButtonIcon.Play or PlaybackButtonIcon.Pause => prominent ? 28 : 26,
            PlaybackButtonIcon.Previous or PlaybackButtonIcon.Next => 22,
            PlaybackButtonIcon.Shuffle
            or PlaybackButtonIcon.Repeat
            or PlaybackButtonIcon.RepeatOne => 20,
            _ => 21
        };
}

internal enum PopupActionIcon
{
    Focus,
    Update,
    Info,
    Quit
}

internal sealed class PopupActionRowControl : Control
{
    private static readonly Color TextColor = Color.FromArgb(224, 224, 230);
    private static readonly Color IconColor = Color.FromArgb(224, 224, 230);
    private static readonly Color HoverColor = Color.FromArgb(30, 255, 255, 255);
    private static readonly Color PressedColor = Color.FromArgb(45, 255, 255, 255);

    private readonly PopupActionIcon icon;
    private bool hovering;
    private bool pressing;

    public PopupActionRowControl(PopupActionIcon icon, string label)
    {
        this.icon = icon;
        Text = label;
        AccessibleName = label;
        AccessibleRole = AccessibleRole.PushButton;
        Cursor = Cursors.Hand;
        TabStop = false;
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );
        BackColor = Color.Transparent;
    }

    public event EventHandler? Pressed;

    protected override void OnMouseEnter(EventArgs e)
    {
        base.OnMouseEnter(e);
        hovering = true;
        Invalidate();
    }

    protected override void OnMouseLeave(EventArgs e)
    {
        base.OnMouseLeave(e);
        hovering = false;
        pressing = false;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (e.Button != MouseButtons.Left) return;
        pressing = true;
        Invalidate();
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (!pressing || e.Button != MouseButtons.Left) return;

        pressing = false;
        Invalidate();

        if (ClientRectangle.Contains(e.Location))
        {
            Pressed?.Invoke(this, EventArgs.Empty);
        }
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        if (hovering || pressing)
        {
            using var backgroundBrush = new SolidBrush(pressing ? PressedColor : HoverColor);
            using var backgroundPath = PlaybackPopupForm.RoundedRectangle(
                new Rectangle(0, 0, Width, Height),
                7
            );
            e.Graphics.FillPath(backgroundBrush, backgroundPath);
        }

        using var iconPen = new Pen(IconColor, 1.8f)
        {
            StartCap = LineCap.Round,
            EndCap = LineCap.Round,
            LineJoin = LineJoin.Round
        };
        using var iconBrush = new SolidBrush(IconColor);
        using var font = new Font(Font.FontFamily, 11f, FontStyle.Bold);

        DrawIcon(e.Graphics, new Rectangle(2, 4, 18, 18), iconPen, iconBrush);
        TextRenderer.DrawText(
            e.Graphics,
            Text,
            font,
            new Rectangle(34, 0, Width - 34, Height),
            TextColor,
            TextFormatFlags.Left | TextFormatFlags.VerticalCenter | TextFormatFlags.EndEllipsis
        );
    }

    private void DrawIcon(Graphics graphics, Rectangle bounds, Pen pen, Brush brush)
    {
        switch (icon)
        {
            case PopupActionIcon.Focus:
                graphics.DrawRectangle(pen, bounds.Left + 2, bounds.Top + 5, 11, 11);
                graphics.DrawLine(pen, bounds.Left + 8, bounds.Top + 4, bounds.Right - 2, bounds.Top + 4);
                graphics.DrawLine(pen, bounds.Right - 2, bounds.Top + 4, bounds.Right - 2, bounds.Bottom - 6);
                graphics.DrawLine(pen, bounds.Right - 2, bounds.Top + 4, bounds.Left + 9, bounds.Bottom - 7);
                break;
            case PopupActionIcon.Update:
                graphics.DrawArc(pen, bounds.Left + 3, bounds.Top + 3, 12, 12, 35, 280);
                graphics.DrawLine(pen, bounds.Right - 4, bounds.Top + 4, bounds.Right - 2, bounds.Top + 9);
                graphics.DrawLine(pen, bounds.Right - 4, bounds.Top + 4, bounds.Right - 9, bounds.Top + 5);
                break;
            case PopupActionIcon.Info:
                graphics.DrawEllipse(pen, bounds.Left + 2, bounds.Top + 2, 14, 14);
                graphics.FillEllipse(brush, bounds.Left + 8, bounds.Top + 5, 2.5f, 2.5f);
                graphics.DrawLine(pen, bounds.Left + 9, bounds.Top + 10, bounds.Left + 9, bounds.Bottom - 3);
                break;
            case PopupActionIcon.Quit:
                graphics.DrawEllipse(pen, bounds.Left + 2, bounds.Top + 2, 14, 14);
                graphics.DrawLine(pen, bounds.Left + 6, bounds.Top + 6, bounds.Right - 6, bounds.Bottom - 6);
                graphics.DrawLine(pen, bounds.Right - 6, bounds.Top + 6, bounds.Left + 6, bounds.Bottom - 6);
                break;
        }
    }
}

internal sealed class SeekBarControl : Control
{
    private static readonly Color TrackColor = Color.FromArgb(76, 76, 80);
    private static readonly Color DisabledTrackColor = Color.FromArgb(42, 42, 48);
    private static readonly Color DisabledFillColor = Color.FromArgb(88, 88, 96);

    private bool dragging;
    private int value;

    public SeekBarControl()
    {
        SetStyle(
            ControlStyles.AllPaintingInWmPaint
                | ControlStyles.OptimizedDoubleBuffer
                | ControlStyles.ResizeRedraw
                | ControlStyles.SupportsTransparentBackColor
                | ControlStyles.UserPaint,
            true
        );
        BackColor = Color.Transparent;
        Cursor = Cursors.Hand;
        AccessibleName = "Playback progress";
        AccessibleRole = AccessibleRole.Slider;
        Minimum = 0;
        Maximum = 1000;
        Height = 20;
    }

    public event EventHandler? UserSeekRequested;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public int Minimum { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public int Maximum { get; set; }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Color AccentColor { get; set; } = Color.Red;

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public int Value
    {
        get => value;
        set
        {
            var clampedValue = Math.Clamp(value, Minimum, Maximum);
            if (this.value == clampedValue) return;
            this.value = clampedValue;
            Invalidate();
        }
    }

    protected override void OnEnabledChanged(EventArgs e)
    {
        base.OnEnabledChanged(e);
        Cursor = Enabled ? Cursors.Hand : Cursors.Default;
        Invalidate();
    }

    protected override void OnMouseDown(MouseEventArgs e)
    {
        base.OnMouseDown(e);
        if (!Enabled || e.Button != MouseButtons.Left) return;

        dragging = true;
        Capture = true;
        SetValueFromPointer(e.X);
        UserSeekRequested?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnMouseMove(MouseEventArgs e)
    {
        base.OnMouseMove(e);
        if (!dragging) return;

        SetValueFromPointer(e.X);
        UserSeekRequested?.Invoke(this, EventArgs.Empty);
    }

    protected override void OnMouseUp(MouseEventArgs e)
    {
        base.OnMouseUp(e);
        if (e.Button != MouseButtons.Left) return;

        dragging = false;
        Capture = false;
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        e.Graphics.SmoothingMode = SmoothingMode.AntiAlias;

        var trackBounds = new Rectangle(0, (Height - 6) / 2, Width, 6);
        if (trackBounds.Width <= 0) return;

        var fillWidth = (int)Math.Round(trackBounds.Width * ProgressFraction());
        var fillBounds = new Rectangle(trackBounds.X, trackBounds.Y, fillWidth, trackBounds.Height);

        using var trackBrush = new SolidBrush(Enabled ? TrackColor : DisabledTrackColor);
        using var fillBrush = new SolidBrush(Enabled ? AccentColor : DisabledFillColor);
        using var trackPath = PlaybackPopupForm.RoundedRectangle(trackBounds, 3);

        e.Graphics.FillPath(trackBrush, trackPath);

        if (fillBounds.Width > 0)
        {
            using var fillPath = PlaybackPopupForm.RoundedRectangle(fillBounds, 3);
            e.Graphics.FillPath(fillBrush, fillPath);
        }
    }

    private void SetValueFromPointer(int x)
    {
        if (Width <= 0 || Maximum <= Minimum) return;

        var fraction = Math.Clamp((double)x / Width, 0, 1);
        Value = Minimum + (int)Math.Round((Maximum - Minimum) * fraction);
    }

    private double ProgressFraction()
    {
        if (Maximum <= Minimum) return 0;
        return Math.Clamp((double)(Value - Minimum) / (Maximum - Minimum), 0, 1);
    }
}
