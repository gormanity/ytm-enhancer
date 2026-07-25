using System.ComponentModel;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal enum WindowsTrayAboutUpdateStatusKind
{
    Idle,
    Checking,
    UpToDate,
    UpdateAvailable,
    Failed
}

internal sealed record WindowsTrayAboutUpdateStatus(
    WindowsTrayAboutUpdateStatusKind Kind,
    string Summary,
    string Detail,
    string ButtonText,
    bool ButtonEnabled
)
{
    public static WindowsTrayAboutUpdateStatus Idle() =>
        new(
            WindowsTrayAboutUpdateStatusKind.Idle,
            "Ready to check for updates.",
            "Check for the latest version of YTM Tray when you are ready.",
            "Check for Updates",
            true
        );

    public static WindowsTrayAboutUpdateStatus Checking() =>
        new(
            WindowsTrayAboutUpdateStatusKind.Checking,
            "Checking for updates.",
            "Looking for the latest version of YTM Tray.",
            "Checking...",
            false
        );

    public static WindowsTrayAboutUpdateStatus UpToDate() =>
        new(
            WindowsTrayAboutUpdateStatusKind.UpToDate,
            "YTM Tray is up to date.",
            "You are running the latest available version.",
            "Check Again",
            true
        );

    public static WindowsTrayAboutUpdateStatus UpdateAvailable(string version) =>
        new(
            WindowsTrayAboutUpdateStatusKind.UpdateAvailable,
            $"YTM Tray {version} is available.",
            "Download and install the update when you are ready.",
            $"Install Update {version}",
            true
        );

    public static WindowsTrayAboutUpdateStatus Failed(string _) =>
        new(
            WindowsTrayAboutUpdateStatusKind.Failed,
            "Unable to check for updates.",
            "Please try again in a moment.",
            "Check Again",
            true
        );
}

internal sealed class AboutDialogForm : Form
{
    private const int DefaultClientWidth = 520;
    private const int DefaultClientHeight = 480;

    private Icon appIcon;
    private Image appIconImage;
    private readonly TableLayoutPanel layout;
    private readonly TableLayoutPanel contentLayout;
    private readonly Control footer;
    private readonly PictureBox appIconBox = new();
    private readonly Label connectionSummaryLabel = new();
    private readonly Label connectionDetailLabel = new();
    private readonly Label updateSummaryLabel = new();
    private readonly Label updateDetailLabel = new();
    private readonly Button updateButton = new();
    private readonly Button closeButton = new();
    private readonly List<Action<TrayTheme>> themeBindings = [];
    private ConnectorSource? currentBrowserSource;
    private Size defaultClientSize;
    private WindowsTrayAboutUpdateStatus currentUpdateStatus =
        WindowsTrayAboutUpdateStatus.Idle();

    public AboutDialogForm()
    {
        var theme = TrayTheme.CurrentApp;
        appIcon = TrayIconFactory.Create(isPlaying: false, theme.StatusIconPaintColor);
        appIconImage = appIcon.ToBitmap();

        Text = "About YTM Tray";
        AccessibleName = "About YTM Tray";
        Icon = appIcon;
        BackColor = theme.AboutSurfaceColor;
        ForeColor = theme.PrimaryTextColor;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(DefaultClientWidth, DefaultClientHeight);

        contentLayout = BuildContentLayout();
        footer = BuildFooter();
        layout = BuildLayout(contentLayout, footer);
        Controls.Add(layout);
        SetBrowserSource(null);
        SetUpdateStatus(WindowsTrayAboutUpdateStatus.Idle());
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnCheckForUpdates { get; set; }

    public void SetBrowserSource(ConnectorSource? source)
    {
        currentBrowserSource = source;
        ApplyBrowserSource(TrayTheme.CurrentApp);
        FitToContentIfVisible();
    }

    public void SetUpdateStatus(WindowsTrayAboutUpdateStatus status)
    {
        currentUpdateStatus = status;
        ApplyUpdateStatus(TrayTheme.CurrentApp);
        FitToContentIfVisible();
    }

    public void ApplyTheme()
    {
        var theme = TrayTheme.CurrentApp;

        BackColor = theme.AboutSurfaceColor;
        ForeColor = theme.PrimaryTextColor;
        foreach (var applyTheme in themeBindings)
        {
            applyTheme(theme);
        }

        RefreshAppIcon(theme);
        ApplyBrowserSource(theme);
        ApplyUpdateStatus(theme);
        FitToContentIfVisible();
        Invalidate(true);
    }

    protected override void OnShown(EventArgs eventArgs)
    {
        base.OnShown(eventArgs);
        defaultClientSize = ClientSize;
        FitToContent();
    }

    private void ApplyBrowserSource(TrayTheme theme)
    {
        if (currentBrowserSource is null)
        {
            connectionSummaryLabel.Text = "Not connected to a browser.";
            connectionDetailLabel.Text =
                "Open one supported browser with YTM Enhancer enabled. YTM Tray supports one active browser connection at a time.";
            connectionSummaryLabel.ForeColor = theme.WarningColor;
            return;
        }

        connectionSummaryLabel.Text = $"Connected to {currentBrowserSource.DisplayName}.";
        connectionDetailLabel.Text =
            "YTM Tray is using this browser for playback info and controls. Disconnect this browser before connecting from another browser.";
        connectionSummaryLabel.ForeColor = theme.SuccessColor;
    }

    private void ApplyUpdateStatus(TrayTheme theme)
    {
        updateSummaryLabel.Text = currentUpdateStatus.Summary;
        updateSummaryLabel.ForeColor = currentUpdateStatus.Kind switch
        {
            WindowsTrayAboutUpdateStatusKind.UpdateAvailable => theme.SuccessColor,
            WindowsTrayAboutUpdateStatusKind.Failed => theme.WarningColor,
            _ => theme.PrimaryTextColor
        };
        updateDetailLabel.Text = currentUpdateStatus.Detail;
        updateButton.Text = currentUpdateStatus.ButtonText;
        updateButton.Enabled = currentUpdateStatus.ButtonEnabled;
    }

    private void RefreshAppIcon(TrayTheme theme)
    {
        var previousIcon = appIcon;
        var previousImage = appIconImage;

        appIcon = TrayIconFactory.Create(isPlaying: false, theme.StatusIconPaintColor);
        appIconImage = appIcon.ToBitmap();
        Icon = appIcon;
        appIconBox.Image = appIconImage;

        previousImage.Dispose();
        previousIcon.Dispose();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            appIconImage.Dispose();
            appIcon.Dispose();
        }

        base.Dispose(disposing);
    }

    private TableLayoutPanel BuildLayout(Control content, Control footerControl)
    {
        var layout = BindTheme(
            new TableLayoutPanel
            {
                Dock = DockStyle.Fill,
                Padding = new Padding(24),
                ColumnCount = 1,
                RowCount = 2
            },
            static (control, theme) => control.BackColor = theme.AboutSurfaceColor
        );
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        var scrollViewport = BindTheme(
            new Panel
            {
                AutoScroll = true,
                Dock = DockStyle.Fill,
                Margin = new Padding(0)
            },
            static (control, theme) => control.BackColor = theme.AboutSurfaceColor
        );
        scrollViewport.Controls.Add(content);

        layout.Controls.Add(scrollViewport, 0, 0);
        layout.Controls.Add(footerControl, 0, 1);
        return layout;
    }

    private TableLayoutPanel BuildContentLayout()
    {
        var content = BindTheme(
            new TableLayoutPanel
            {
                AutoSize = true,
                AutoSizeMode = AutoSizeMode.GrowAndShrink,
                Dock = DockStyle.Top,
                Margin = new Padding(0),
                ColumnCount = 1,
                RowCount = 5
            },
            static (control, theme) => control.BackColor = theme.AboutSurfaceColor
        );
        content.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        content.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        content.RowStyles.Add(new RowStyle(SizeType.Absolute, 14));
        content.RowStyles.Add(new RowStyle(SizeType.AutoSize));

        content.Controls.Add(BuildHeader(), 0, 0);
        content.Controls.Add(BuildConnectionSection(), 0, 2);
        content.Controls.Add(BuildUpdateSection(), 0, 4);
        return content;
    }

    private void FitToContentIfVisible()
    {
        if (Visible)
        {
            FitToContent();
        }
    }

    private void FitToContent()
    {
        var workingArea = Screen.FromControl(this).WorkingArea;
        var frameWidth = Math.Max(0, Width - ClientSize.Width);
        var frameHeight = Math.Max(0, Height - ClientSize.Height);
        var maximumClientWidth = Math.Max(1, workingArea.Width - frameWidth);
        var maximumClientHeight = Math.Max(1, workingArea.Height - frameHeight);
        var targetWidth = Math.Min(defaultClientSize.Width, maximumClientWidth);
        var baselineHeight = Math.Min(defaultClientSize.Height, maximumClientHeight);

        ClientSize = new Size(targetWidth, baselineHeight);
        PerformLayout();
        contentLayout.PerformLayout();

        var contentWidth = Math.Max(1, targetWidth - layout.Padding.Horizontal);
        var preferredContentHeight = contentLayout
            .GetPreferredSize(new Size(contentWidth, 0))
            .Height;
        var preferredFooterHeight = footer
            .GetPreferredSize(new Size(contentWidth, 0))
            .Height;
        var preferredHeight =
            layout.Padding.Vertical
            + preferredContentHeight
            + footer.Margin.Vertical
            + preferredFooterHeight;
        var targetHeight = Math.Min(
            Math.Max(defaultClientSize.Height, preferredHeight),
            maximumClientHeight
        );
        ClientSize = new Size(targetWidth, targetHeight);

        var maximumLeft = Math.Max(workingArea.Left, workingArea.Right - Width);
        var maximumTop = Math.Max(workingArea.Top, workingArea.Bottom - Height);
        Location = new Point(
            Math.Clamp(Left, workingArea.Left, maximumLeft),
            Math.Clamp(Top, workingArea.Top, maximumTop)
        );
    }

    private Control BuildHeader()
    {
        var header = BindTheme(
            new TableLayoutPanel
            {
                Dock = DockStyle.Top,
                AutoSize = true,
                ColumnCount = 2,
                RowCount = 1
            },
            static (control, theme) => control.BackColor = theme.AboutSurfaceColor
        );
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        appIconBox.Image = appIconImage;
        appIconBox.SizeMode = PictureBoxSizeMode.Zoom;
        appIconBox.Size = new Size(56, 56);
        appIconBox.Margin = new Padding(0, 0, 16, 0);

        var textStack = BindTheme(
            new FlowLayoutPanel
            {
                AutoSize = true,
                FlowDirection = FlowDirection.TopDown,
                WrapContents = false,
                Dock = DockStyle.Top,
                Margin = new Padding(0)
            },
            static (control, theme) => control.BackColor = theme.AboutSurfaceColor
        );
        textStack.Controls.Add(
            MakeLabel(
                "YTM Tray",
                17f,
                FontStyle.Bold,
                static theme => theme.PrimaryTextColor,
                maxWidth: 380
            )
        );
        textStack.Controls.Add(
            MakeLabel(
                $"Version {ConnectorProtocol.ConnectorVersion} - {RuntimeInformation.RuntimeIdentifier}",
                9f,
                FontStyle.Regular,
                static theme => theme.SecondaryTextColor,
                maxWidth: 380
            )
        );
        textStack.Controls.Add(BuildBetaLabel());
        textStack.Controls.Add(
            MakeLabel(
                "See what's playing and control YouTube Music from the Windows taskbar.",
                9f,
                FontStyle.Regular,
                static theme => theme.TertiaryTextColor,
                maxWidth: 380
            )
        );

        header.Controls.Add(appIconBox, 0, 0);
        header.Controls.Add(textStack, 1, 0);
        return header;
    }

    private Control BuildBetaLabel()
    {
        var label = MakeLabel(
            "Beta",
            8f,
            FontStyle.Bold,
            static theme => theme.WarningColor,
            maxWidth: 180
        );
        label.Margin = new Padding(0, 6, 0, 5);
        return label;
    }

    private Control BuildUpdateSection()
    {
        var panel = BuildPanel();
        panel.Controls.Add(MakeSectionLabel("Updates"), 0, 0);
        panel.Controls.Add(updateSummaryLabel, 0, 1);
        panel.Controls.Add(updateDetailLabel, 0, 2);
        panel.Controls.Add(BuildUpdateButtonRow(), 0, 3);

        updateSummaryLabel.Font = new Font(Font.FontFamily, 10.25f, FontStyle.Bold);
        updateSummaryLabel.AutoSize = true;
        updateSummaryLabel.MaximumSize = new Size(424, 0);
        updateSummaryLabel.Margin = new Padding(0, 6, 0, 0);

        updateDetailLabel.Font = new Font(Font.FontFamily, 9f, FontStyle.Regular);
        BindTheme(
            updateDetailLabel,
            static (control, theme) => control.ForeColor = theme.TertiaryTextColor
        );
        updateDetailLabel.AutoSize = true;
        updateDetailLabel.MaximumSize = new Size(424, 0);
        updateDetailLabel.Margin = new Padding(0, 4, 0, 0);
        return panel;
    }

    private Control BuildUpdateButtonRow()
    {
        var row = BindTheme(
            new FlowLayoutPanel
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                Margin = new Padding(0, 14, 0, 0)
            },
            static (control, theme) => control.BackColor = theme.AboutPanelColor
        );

        updateButton.AutoSize = false;
        updateButton.Width = 170;
        updateButton.Height = 34;
        updateButton.FlatStyle = FlatStyle.Flat;
        updateButton.FlatAppearance.BorderSize = 1;
        BindTheme(
            updateButton,
            static (control, theme) =>
            {
                control.FlatAppearance.BorderColor = theme.AccentColor;
                control.BackColor = theme.AccentColor;
                control.ForeColor = Color.White;
            }
        );
        updateButton.Font = new Font(Font.FontFamily, 9f, FontStyle.Bold);
        updateButton.Cursor = Cursors.Hand;
        updateButton.Click += (_, _) => OnCheckForUpdates?.Invoke();

        row.Controls.Add(updateButton);
        return row;
    }

    private Control BuildConnectionSection()
    {
        var panel = BuildPanel();
        panel.Controls.Add(MakeSectionLabel("Browser Connection"), 0, 0);
        panel.Controls.Add(connectionSummaryLabel, 0, 1);
        panel.Controls.Add(connectionDetailLabel, 0, 2);

        connectionSummaryLabel.Font = new Font(Font.FontFamily, 10.25f, FontStyle.Bold);
        connectionSummaryLabel.AutoSize = true;
        connectionSummaryLabel.MaximumSize = new Size(424, 0);
        connectionSummaryLabel.Margin = new Padding(0, 6, 0, 0);

        connectionDetailLabel.Font = new Font(Font.FontFamily, 9f, FontStyle.Regular);
        BindTheme(
            connectionDetailLabel,
            static (control, theme) => control.ForeColor = theme.TertiaryTextColor
        );
        connectionDetailLabel.AutoSize = true;
        connectionDetailLabel.MaximumSize = new Size(424, 0);
        connectionDetailLabel.Margin = new Padding(0, 4, 0, 0);
        return panel;
    }

    private TableLayoutPanel BuildPanel()
    {
        var panel = BindTheme(
            new TableLayoutPanel
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                Padding = new Padding(18),
                ColumnCount = 1,
                RowCount = 4
            },
            static (control, theme) => control.BackColor = theme.AboutPanelColor
        );
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        return panel;
    }

    private Control BuildFooter()
    {
        var row = BindTheme(
            new FlowLayoutPanel
            {
                AutoSize = true,
                Dock = DockStyle.Top,
                FlowDirection = FlowDirection.RightToLeft,
                Margin = new Padding(0, 16, 0, 0)
            },
            static (control, theme) => control.BackColor = theme.AboutSurfaceColor
        );

        closeButton.Text = "Close";
        closeButton.AccessibleName = "Close";
        closeButton.AutoSize = false;
        closeButton.Width = 96;
        closeButton.Height = 32;
        closeButton.FlatStyle = FlatStyle.Flat;
        closeButton.FlatAppearance.BorderSize = 1;
        BindTheme(
            closeButton,
            static (control, theme) =>
            {
                control.FlatAppearance.BorderColor = theme.DialogButtonBorderColor;
                control.BackColor = theme.DialogButtonBackgroundColor;
                control.ForeColor = theme.PrimaryTextColor;
            }
        );
        closeButton.Font = new Font(Font.FontFamily, 9f, FontStyle.Regular);
        closeButton.Cursor = Cursors.Hand;
        closeButton.Click += (_, _) => Close();
        CancelButton = closeButton;

        row.Controls.Add(closeButton);
        return row;
    }

    private Label MakeSectionLabel(string text) =>
        MakeLabel(
            text,
            8.5f,
            FontStyle.Bold,
            static theme => theme.TertiaryTextColor,
            maxWidth: 424
        );

    private Label MakeLabel(
        string text,
        float size,
        FontStyle style,
        Func<TrayTheme, Color> color,
        int maxWidth
    )
    {
        var label = new Label
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(maxWidth, 0),
            Font = new Font(Font.FontFamily, size, style),
            BackColor = Color.Transparent,
            Margin = new Padding(0, 2, 0, 0)
        };

        return BindTheme(label, (control, theme) => control.ForeColor = color(theme));
    }

    private T BindTheme<T>(T control, Action<T, TrayTheme> applyTheme)
        where T : Control
    {
        applyTheme(control, TrayTheme.CurrentApp);
        themeBindings.Add(theme => applyTheme(control, theme));
        return control;
    }
}
