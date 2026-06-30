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
            "YTM Tray can check the component-scoped GitHub release manifest when you are ready.",
            "Check for Updates",
            true
        );

    public static WindowsTrayAboutUpdateStatus Checking() =>
        new(
            WindowsTrayAboutUpdateStatusKind.Checking,
            "Checking for updates.",
            "YTM Tray is checking the Windows tray release manifest.",
            "Checking...",
            false
        );

    public static WindowsTrayAboutUpdateStatus UpToDate() =>
        new(
            WindowsTrayAboutUpdateStatusKind.UpToDate,
            "YTM Tray is up to date.",
            "You are running the latest available version for this Windows install.",
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

    public static WindowsTrayAboutUpdateStatus Failed(string message) =>
        new(
            WindowsTrayAboutUpdateStatusKind.Failed,
            "Unable to check for updates.",
            message,
            "Check Again",
            true
        );
}

internal sealed class AboutDialogForm : Form
{
    private static readonly Color SurfaceColor = Color.FromArgb(14, 14, 16);
    private static readonly Color PanelColor = Color.FromArgb(24, 24, 27);
    private static readonly Color PrimaryTextColor = Color.White;
    private static readonly Color SecondaryTextColor = Color.FromArgb(210, 210, 216);
    private static readonly Color MutedTextColor = Color.FromArgb(150, 150, 158);
    private static readonly Color AccentColor = Color.FromArgb(255, 32, 18);
    private static readonly Color WarningColor = Color.FromArgb(255, 158, 61);
    private static readonly Color SuccessColor = Color.FromArgb(90, 210, 135);

    private readonly Icon appIcon;
    private readonly Image appIconImage;
    private readonly Label updateSummaryLabel = new();
    private readonly Label updateDetailLabel = new();
    private readonly Button updateButton = new();

    public AboutDialogForm()
    {
        appIcon = TrayIconFactory.Create(isPlaying: false);
        appIconImage = appIcon.ToBitmap();

        Text = "About YTM Tray";
        AccessibleName = "About YTM Tray";
        Icon = appIcon;
        BackColor = SurfaceColor;
        ForeColor = PrimaryTextColor;
        Font = new Font("Segoe UI", 9f, FontStyle.Regular);
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(520, 500);

        Controls.Add(BuildLayout());
        SetUpdateStatus(WindowsTrayAboutUpdateStatus.Idle());
    }

    [DesignerSerializationVisibility(DesignerSerializationVisibility.Hidden)]
    public Action? OnCheckForUpdates { get; set; }

    public void SetUpdateStatus(WindowsTrayAboutUpdateStatus status)
    {
        updateSummaryLabel.Text = status.Summary;
        updateSummaryLabel.ForeColor = status.Kind switch
        {
            WindowsTrayAboutUpdateStatusKind.UpdateAvailable => SuccessColor,
            WindowsTrayAboutUpdateStatusKind.Failed => WarningColor,
            _ => PrimaryTextColor
        };
        updateDetailLabel.Text = status.Detail;
        updateButton.Text = status.ButtonText;
        updateButton.Enabled = status.ButtonEnabled;
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

    private Control BuildLayout()
    {
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            BackColor = SurfaceColor,
            Padding = new Padding(24),
            ColumnCount = 1,
            RowCount = 5
        };
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 18));
        layout.RowStyles.Add(new RowStyle(SizeType.AutoSize));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 14));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));

        layout.Controls.Add(BuildHeader(), 0, 0);
        layout.Controls.Add(BuildUpdateSection(), 0, 2);
        layout.Controls.Add(BuildProcessSection(), 0, 4);
        return layout;
    }

    private Control BuildHeader()
    {
        var header = new TableLayoutPanel
        {
            Dock = DockStyle.Top,
            AutoSize = true,
            BackColor = SurfaceColor,
            ColumnCount = 2,
            RowCount = 1
        };
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 72));
        header.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));

        var iconBox = new PictureBox
        {
            Image = appIconImage,
            SizeMode = PictureBoxSizeMode.Zoom,
            Size = new Size(56, 56),
            Margin = new Padding(0, 0, 16, 0)
        };

        var textStack = new FlowLayoutPanel
        {
            AutoSize = true,
            FlowDirection = FlowDirection.TopDown,
            WrapContents = false,
            Dock = DockStyle.Top,
            BackColor = SurfaceColor,
            Margin = new Padding(0)
        };
        textStack.Controls.Add(
            MakeLabel("YTM Tray", 17f, FontStyle.Bold, PrimaryTextColor, maxWidth: 380)
        );
        textStack.Controls.Add(
            MakeLabel(
                $"Version {ConnectorProtocol.ConnectorVersion} - {RuntimeInformation.RuntimeIdentifier}",
                9f,
                FontStyle.Regular,
                SecondaryTextColor,
                maxWidth: 380
            )
        );
        textStack.Controls.Add(BuildBetaLabel());
        textStack.Controls.Add(
            MakeLabel(
                "First-party Windows tray controls for YTM Enhancer connected apps.",
                9f,
                FontStyle.Regular,
                MutedTextColor,
                maxWidth: 380
            )
        );

        header.Controls.Add(iconBox, 0, 0);
        header.Controls.Add(textStack, 1, 0);
        return header;
    }

    private Control BuildBetaLabel()
    {
        var label = MakeLabel(
            "Beta connected app",
            8f,
            FontStyle.Bold,
            WarningColor,
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
        updateDetailLabel.ForeColor = MutedTextColor;
        updateDetailLabel.AutoSize = true;
        updateDetailLabel.MaximumSize = new Size(424, 0);
        updateDetailLabel.Margin = new Padding(0, 4, 0, 0);
        return panel;
    }

    private Control BuildUpdateButtonRow()
    {
        var row = new FlowLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Top,
            BackColor = PanelColor,
            Margin = new Padding(0, 14, 0, 0)
        };

        updateButton.AutoSize = false;
        updateButton.Width = 170;
        updateButton.Height = 34;
        updateButton.FlatStyle = FlatStyle.Flat;
        updateButton.FlatAppearance.BorderColor = AccentColor;
        updateButton.FlatAppearance.BorderSize = 1;
        updateButton.BackColor = AccentColor;
        updateButton.ForeColor = Color.White;
        updateButton.Font = new Font(Font.FontFamily, 9f, FontStyle.Bold);
        updateButton.Cursor = Cursors.Hand;
        updateButton.Click += (_, _) => OnCheckForUpdates?.Invoke();

        row.Controls.Add(updateButton);
        return row;
    }

    private Control BuildProcessSection()
    {
        var panel = BuildPanel();
        panel.Controls.Add(MakeSectionLabel("How updates work"), 0, 0);
        panel.Controls.Add(
            MakeLabel(
                "YTM Tray checks the component-scoped GitHub release manifest, downloads the matching package for this Windows runtime, verifies the SHA-256 checksum, and then runs the local installer.",
                9f,
                FontStyle.Regular,
                SecondaryTextColor,
                maxWidth: 424
            ),
            0,
            1
        );
        panel.Controls.Add(
            MakeLabel(
                "The installer replaces files in %LOCALAPPDATA%\\YTM Enhancer\\Tray and refreshes browser native messaging host registration.",
                9f,
                FontStyle.Regular,
                SecondaryTextColor,
                maxWidth: 424
            ),
            0,
            2
        );
        panel.Controls.Add(
            MakeLabel(
                "Beta builds may use a self-signed publisher while Windows signing is finalized.",
                8.5f,
                FontStyle.Regular,
                MutedTextColor,
                maxWidth: 424
            ),
            0,
            3
        );
        return panel;
    }

    private TableLayoutPanel BuildPanel()
    {
        var panel = new TableLayoutPanel
        {
            AutoSize = true,
            Dock = DockStyle.Top,
            BackColor = PanelColor,
            Padding = new Padding(18),
            ColumnCount = 1,
            RowCount = 4
        };
        panel.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        return panel;
    }

    private Label MakeSectionLabel(string text) =>
        MakeLabel(text, 8.5f, FontStyle.Bold, MutedTextColor, maxWidth: 424);

    private Label MakeLabel(
        string text,
        float size,
        FontStyle style,
        Color color,
        int maxWidth
    ) =>
        new()
        {
            Text = text,
            AutoSize = true,
            MaximumSize = new Size(maxWidth, 0),
            Font = new Font(Font.FontFamily, size, style),
            ForeColor = color,
            BackColor = Color.Transparent,
            Margin = new Padding(0, 2, 0, 0)
        };
}
