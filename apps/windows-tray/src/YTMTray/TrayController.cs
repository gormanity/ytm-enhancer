using System.Drawing;
using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal sealed class TrayController : ITrayController, IDisposable
{
    private const int PopupEdgePadding = 8;
    private const int TaskbarFlyoutClearance = 112;

    private readonly NotifyIcon notifyIcon;
    private readonly PlaybackPopupForm popup;
    private readonly Icon idleIcon;
    private readonly Icon playingIcon;
    private readonly WindowsTrayUpdateService updateService;
    private readonly NativeAppLogger? logger;
    private readonly CancellationTokenSource updateCancellation = new();
    private ToolStripMenuItem? updateMenuItem;
    private WindowsTrayUpdateCheckResult? availableUpdate;
    private bool updateCheckInProgress;

    public Action? OnShuffle { get; set; }
    public Action? OnPrevious { get; set; }
    public Action? OnTogglePlay { get; set; }
    public Action? OnNext { get; set; }
    public Action? OnRepeat { get; set; }
    public Action<double>? OnSeek { get; set; }
    public Action? OnFocusYouTubeMusic { get; set; }
    public Action? OnQuit { get; set; }

    public TrayController(
        string initialStatus,
        WindowsTrayUpdateService? updateService = null,
        NativeAppLogger? logger = null
    )
    {
        this.updateService = updateService ?? WindowsTrayUpdateService.CreateDefault();
        this.logger = logger;
        popup = new PlaybackPopupForm(logger);
        idleIcon = TrayIconFactory.Create(isPlaying: false);
        playingIcon = TrayIconFactory.Create(isPlaying: true);

        popup.OnShuffle = () => OnShuffle?.Invoke();
        popup.OnPrevious = () => OnPrevious?.Invoke();
        popup.OnTogglePlay = () => OnTogglePlay?.Invoke();
        popup.OnNext = () => OnNext?.Invoke();
        popup.OnRepeat = () => OnRepeat?.Invoke();
        popup.OnSeek = time => OnSeek?.Invoke(time);
        popup.OnFocusYouTubeMusic = () => OnFocusYouTubeMusic?.Invoke();
        popup.OnCheckForUpdates = () => _ = CheckForUpdatesAsync(popup, userInitiated: true);
        popup.OnAbout = () => ShowAbout(popup);
        popup.OnQuit = () => OnQuit?.Invoke();
        _ = popup.Handle;

        notifyIcon = new NotifyIcon
        {
            ContextMenuStrip = CreateContextMenu(),
            Icon = idleIcon,
            Text = "YTM Enhancer",
            Visible = true
        };
        notifyIcon.MouseClick += HandleTrayClick;
        UpdateConnectionStatus(initialStatus);
    }

    public void StartBackgroundUpdateCheck()
    {
        _ = CheckForUpdatesAfterDelayAsync();
    }

    public void UpdateConnectionStatus(string status)
    {
        RunOnUiThread(() =>
        {
            notifyIcon.Icon = idleIcon;
            notifyIcon.Text = "YTM Enhancer";
            popup.UpdateConnectionStatus(status);
        });
    }

    public void SetStalePlaybackState()
    {
        RunOnUiThread(popup.SetStalePlaybackState);
    }

    public void UpdatePlayback(PlaybackState state)
    {
        RunOnUiThread(() =>
        {
            notifyIcon.Icon = state.IsPlaying ? playingIcon : idleIcon;
            popup.UpdatePlayback(state);
        });
    }

    public void Dispose()
    {
        updateCancellation.Cancel();
        updateCancellation.Dispose();
        notifyIcon.Visible = false;
        notifyIcon.Dispose();
        popup.Dispose();
        idleIcon.Dispose();
        playingIcon.Dispose();
    }

    private ContextMenuStrip CreateContextMenu()
    {
        var menu = new ContextMenuStrip();
        menu.Items.Add("Focus YouTube Music", null, (_, _) => OnFocusYouTubeMusic?.Invoke());
        updateMenuItem = new ToolStripMenuItem(
            "Check for Updates",
            null,
            (_, _) => _ = CheckForUpdatesAsync(owner: null, userInitiated: true)
        );
        menu.Items.Add(updateMenuItem);
        menu.Items.Add("About YTM Tray", null, (_, _) => ShowAbout());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => OnQuit?.Invoke());
        return menu;
    }

    private async Task CheckForUpdatesAsync(IWin32Window? owner, bool userInitiated)
    {
        if (updateCheckInProgress)
        {
            if (userInitiated)
            {
                ShowUpdateMessage(
                    owner,
                    "YTM Tray is already checking for updates.",
                    MessageBoxIcon.Information
                );
            }
            return;
        }

        updateCheckInProgress = true;
        var cancellationToken = updateCancellation.Token;

        try
        {
            var update =
                availableUpdate?.IsUpdateAvailable == true
                    ? availableUpdate
                    : await updateService.CheckForUpdateAsync(cancellationToken);
            ApplyUpdateAvailability(update, showNotification: !userInitiated);

            if (!update.IsUpdateAvailable)
            {
                if (userInitiated)
                {
                    ShowUpdateMessage(
                        owner,
                        "YTM Tray is up to date.",
                        MessageBoxIcon.Information
                    );
                }
                return;
            }

            if (!userInitiated)
            {
                return;
            }

            var installChoice = MessageBox.Show(
                owner,
                $"YTM Tray {update.LatestVersion} is available.\n\nDownload and install it now? YTM Tray will quit while the installer runs.",
                "Update YTM Tray",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information
            );
            if (installChoice != DialogResult.Yes) return;

            var preparedUpdate = await updateService.DownloadAndPrepareUpdateAsync(
                update,
                cancellationToken: cancellationToken
            );
            MessageBox.Show(
                owner,
                "The update package was verified. YTM Tray will quit and run the installer now.",
                "Update YTM Tray",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            updateService.StartInstaller(preparedUpdate);
            OnQuit?.Invoke();
        }
        catch (OperationCanceledException)
        {
            logger?.Log("windows tray update check cancelled");
        }
        catch (Exception error)
        {
            logger?.Log($"windows tray update check failed: {error.Message}");
            if (userInitiated)
            {
                ShowUpdateMessage(
                    owner,
                    $"YTM Tray could not check for updates.\n\n{error.Message}",
                    MessageBoxIcon.Warning
                );
            }
        }
        finally
        {
            updateCheckInProgress = false;
        }
    }

    private async Task CheckForUpdatesAfterDelayAsync()
    {
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(8), updateCancellation.Token);
            await CheckForUpdatesAsync(owner: null, userInitiated: false);
        }
        catch (OperationCanceledException)
        {
            logger?.Log("windows tray background update check cancelled");
        }
    }

    private void ApplyUpdateAvailability(
        WindowsTrayUpdateCheckResult update,
        bool showNotification
    )
    {
        availableUpdate = update.IsUpdateAvailable ? update : null;
        RunOnUiThread(() =>
        {
            var updateLabel = update.IsUpdateAvailable
                ? $"Install Update {update.LatestVersion}"
                : "Check for Updates";
            if (updateMenuItem is not null)
            {
                updateMenuItem.Text = updateLabel;
            }
            popup.SetUpdateAvailable(update.IsUpdateAvailable ? update.LatestVersion : null);

            if (showNotification && update.IsUpdateAvailable)
            {
                notifyIcon.ShowBalloonTip(
                    10000,
                    "YTM Tray update available",
                    $"Version {update.LatestVersion} can be installed from the tray menu.",
                    ToolTipIcon.Info
                );
            }
        });
    }

    private static void ShowUpdateMessage(
        IWin32Window? owner,
        string message,
        MessageBoxIcon icon
    )
    {
        const string title = "Update YTM Tray";
        if (owner is null)
        {
            MessageBox.Show(message, title, MessageBoxButtons.OK, icon);
            return;
        }

        MessageBox.Show(owner, message, title, MessageBoxButtons.OK, icon);
    }

    private void HandleTrayClick(object? sender, MouseEventArgs args)
    {
        if (args.Button != MouseButtons.Left) return;

        if (popup.Visible)
        {
            popup.Hide();
            return;
        }

        var workingArea = Screen.FromPoint(Cursor.Position).WorkingArea;
        var x = Math.Min(Cursor.Position.X, workingArea.Right - popup.Width);
        var y = workingArea.Bottom - popup.Height - TaskbarFlyoutClearance;
        popup.Location = new Point(
            Math.Max(workingArea.Left, x),
            Math.Max(workingArea.Top + PopupEdgePadding, y)
        );
        popup.Show();
        popup.Activate();
    }

    private void RunOnUiThread(Action action)
    {
        if (popup.IsDisposed) return;

        if (popup.InvokeRequired)
        {
            popup.BeginInvoke(
                (MethodInvoker)(() =>
                {
                    if (!popup.IsDisposed)
                    {
                        action();
                    }
                })
            );
            return;
        }

        action();
    }

    private static void ShowAbout(IWin32Window? owner = null)
    {
        const string message =
            "YTM Tray connects YTM Enhancer to Windows tray playback controls.";
        const string title = "About YTM Tray";

        if (owner is null)
        {
            MessageBox.Show(
                message,
                title,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return;
        }

        MessageBox.Show(
            owner,
            message,
            title,
            MessageBoxButtons.OK,
            MessageBoxIcon.Information
        );
    }
}
