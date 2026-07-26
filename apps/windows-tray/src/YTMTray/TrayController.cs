using System.Drawing;
using System.Diagnostics;
using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal sealed class TrayController : ITrayController, IDisposable
{
    private static readonly TimeSpan TrayClickSuppressWindow = TimeSpan.FromMilliseconds(350);

    private readonly NotifyIcon notifyIcon;
    private readonly PlaybackPopupForm popup;
    private Icon idleIcon;
    private Icon playingIcon;
    private readonly WindowsTrayUpdateService updateService;
    private readonly WindowsTrayUpdateSession updateSession = new();
    private readonly NativeAppLogger? logger;
    private readonly CancellationTokenSource updateCancellation = new();
    private ToolStripMenuItem? focusMenuItem;
    private ToolStripMenuItem? aboutMenuItem;
    private AboutDialogForm? aboutDialog;
    private ConnectorSource? browserSource;
    private PopupDismissMouseHook? popupDismissMouseHook;
    private DateTime suppressTrayClickUntil = DateTime.MinValue;
    private bool isPlaying;

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
        popup.OnAbout = () => ShowAbout(popup);
        popup.OnQuit = () => OnQuit?.Invoke();
        popup.ThemeChanged += (_, _) => aboutDialog?.ApplyTheme();
        popup.ThemeChanged += (_, _) => RefreshTrayIcons();
        popup.Deactivate += (_, _) => HidePopupFromOutsideClick();
        popup.VisibleChanged += (_, _) =>
        {
            if (!popup.Visible)
            {
                popupDismissMouseHook?.Uninstall();
            }
        };
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

    public void OpenPopupForTest()
    {
        RunOnUiThread(() => ShowPopup(Screen.PrimaryScreen?.WorkingArea, anchorPoint: null));
    }

    public void UpdateConnectionStatus(string status)
    {
        RunOnUiThread(() =>
        {
            isPlaying = false;
            notifyIcon.Icon = idleIcon;
            notifyIcon.Text = "YTM Enhancer";
            popup.UpdateConnectionStatus(status);
        });
    }

    public void UpdateBrowserSource(ConnectorSource? source)
    {
        RunOnUiThread(() =>
        {
            browserSource = source;
            aboutDialog?.SetBrowserSource(source);
        });
    }

    public void SetStalePlaybackState()
    {
        RunOnUiThread(popup.SetStalePlaybackState);
    }

    public void UpdateYouTubeMusicTabAvailability(bool available)
    {
        RunOnUiThread(() =>
        {
            var label = available
                ? "Focus YouTube Music"
                : "Open YouTube Music";
            popup.SetYouTubeMusicTabAvailable(available);
            if (focusMenuItem is not null)
            {
                focusMenuItem.Text = label;
                focusMenuItem.AccessibleName = label;
            }
        });
    }

    public void RequestUninstall()
    {
        RunOnUiThread(() => StartUninstaller(popup));
    }

    public void UpdatePlayback(PlaybackState state)
    {
        RunOnUiThread(() =>
        {
            isPlaying = state.IsPlaying;
            notifyIcon.Icon = isPlaying ? playingIcon : idleIcon;
            popup.UpdatePlayback(state);
        });
    }

    public void Dispose()
    {
        updateCancellation.Cancel();
        updateCancellation.Dispose();
        popupDismissMouseHook?.Dispose();
        notifyIcon.Visible = false;
        notifyIcon.Dispose();
        aboutDialog?.Dispose();
        popup.Dispose();
        idleIcon.Dispose();
        playingIcon.Dispose();
    }

    private ContextMenuStrip CreateContextMenu()
    {
        var menu = new ContextMenuStrip();
        focusMenuItem = new ToolStripMenuItem(
            "Open YouTube Music",
            null,
            (_, _) => OnFocusYouTubeMusic?.Invoke()
        );
        focusMenuItem.AccessibleName = focusMenuItem.Text;
        menu.Items.Add(focusMenuItem);
        aboutMenuItem = new ToolStripMenuItem(
            "About YTM Tray",
            null,
            (_, _) => ShowAbout()
        );
        aboutMenuItem.AccessibleName = aboutMenuItem.Text;
        menu.Items.Add(aboutMenuItem);
        menu.Items.Add("Uninstall YTM Tray...", null, (_, _) => StartUninstaller());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => OnQuit?.Invoke());
        return menu;
    }

    private void RefreshTrayIcons()
    {
        var previousIdleIcon = idleIcon;
        var previousPlayingIcon = playingIcon;
        idleIcon = TrayIconFactory.Create(isPlaying: false);
        playingIcon = TrayIconFactory.Create(isPlaying: true);
        notifyIcon.Icon = isPlaying ? playingIcon : idleIcon;
        previousIdleIcon.Dispose();
        previousPlayingIcon.Dispose();
    }

    private async Task CheckForUpdatesAsync(IWin32Window? owner, bool userInitiated)
    {
        if (
            !updateSession.TryBeginCheck(
                reuseAvailableUpdate: userInitiated,
                out var cachedUpdate
            )
        )
        {
            return;
        }

        ApplyUpdatePresentation();
        var cancellationToken = updateCancellation.Token;

        try
        {
            var update =
                cachedUpdate
                ?? await updateService.CheckForUpdateAsync(cancellationToken);
            updateSession.ApplyResult(update);
            ApplyUpdatePresentation();

            if (!updateSession.HasUpdateAvailable)
            {
                return;
            }

            if (!userInitiated)
            {
                return;
            }

            var installChoice = MessageBox.Show(
                CurrentOwner(owner),
                $"YTM Tray {update.LatestVersion} is available.\n\nDownload and install it now? YTM Tray will quit while the installer runs.",
                "Update YTM Tray",
                MessageBoxButtons.YesNo,
                MessageBoxIcon.Information
            );
            if (installChoice != DialogResult.Yes) return;

            updateSession.BeginDownload();
            ApplyUpdatePresentation();
            var preparedUpdate = await updateService.DownloadAndPrepareUpdateAsync(
                update,
                cancellationToken: cancellationToken
            );
            MessageBox.Show(
                CurrentOwner(owner),
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
            updateSession.Fail(error.Message);
            ApplyUpdatePresentation();
        }
        finally
        {
            updateSession.CompleteCheck();
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

    private void ApplyUpdatePresentation()
    {
        var updateAvailable = updateSession.HasUpdateAvailable;
        var aboutUpdateStatus = CurrentAboutUpdateStatus();
        SetAboutUpdateStatus(aboutUpdateStatus, updateAvailable);
    }

    private void SetAboutUpdateStatus(
        WindowsTrayAboutUpdateStatus status,
        bool updateAvailable
    )
    {
        RunOnUiThread(() =>
        {
            var aboutLabel = updateAvailable
                ? "About YTM Tray - Update Available"
                : "About YTM Tray";
            if (aboutMenuItem is not null)
            {
                aboutMenuItem.Text = aboutLabel;
                aboutMenuItem.AccessibleName = aboutLabel;
            }
            popup.SetAboutUpdateAvailable(updateAvailable);
            aboutDialog?.SetUpdateStatus(status);
        });
    }

    private static IWin32Window? CurrentOwner(IWin32Window? owner)
    {
        if (owner is Control control && (control.IsDisposed || control.Disposing))
        {
            return null;
        }

        return owner;
    }

    private void StartUninstaller(IWin32Window? owner = null)
    {
        var uninstallerPath = Path.Combine(AppContext.BaseDirectory, "YTMTray.Setup.exe");
        if (!File.Exists(uninstallerPath))
        {
            ShowUninstallMessage(
                owner,
                "This YTM Tray build does not include the native uninstaller. Reinstall from the Windows install page, then try again.",
                MessageBoxIcon.Warning
            );
            return;
        }

        var uninstallChoice = MessageBox.Show(
            owner,
            "Uninstall YTM Tray?\n\nThis will close the tray app, remove browser native messaging registration, remove Start Menu shortcuts, and remove the installed app files.",
            "Uninstall YTM Tray",
            MessageBoxButtons.YesNo,
            MessageBoxIcon.Warning
        );
        if (uninstallChoice != DialogResult.Yes) return;

        var startInfo = new ProcessStartInfo(uninstallerPath)
        {
            UseShellExecute = false,
            WorkingDirectory = AppContext.BaseDirectory
        };
        startInfo.ArgumentList.Add("uninstall");
        startInfo.ArgumentList.Add("--quiet");

        try
        {
            Process.Start(startInfo);
            OnQuit?.Invoke();
        }
        catch (Exception error)
        {
            logger?.Log($"windows tray uninstall launch failed: {error.Message}");
            ShowUninstallMessage(
                owner,
                $"YTM Tray could not start the uninstaller.\n\n{error.Message}",
                MessageBoxIcon.Warning
            );
        }
    }

    private static void ShowUninstallMessage(
        IWin32Window? owner,
        string message,
        MessageBoxIcon icon
    )
    {
        const string title = "Uninstall YTM Tray";
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
        if (ShouldSuppressTrayClick()) return;

        if (popup.Visible)
        {
            popup.Hide();
            return;
        }

        ShowPopup(Screen.FromPoint(Cursor.Position).WorkingArea, Cursor.Position);
    }

    private void ShowPopup(Rectangle? bounds, Point? anchorPoint)
    {
        var workingArea = bounds ?? Screen.PrimaryScreen?.WorkingArea ?? Screen.GetWorkingArea(popup);
        popup.Location = TrayPopupPlacement.Calculate(workingArea, popup.Size, anchorPoint);
        popup.Show();
        popup.Activate();
        InstallPopupDismissal();
    }

    private void InstallPopupDismissal()
    {
        popupDismissMouseHook ??= new PopupDismissMouseHook(
            popup,
            () => HidePopupFromOutsideClick(suppressNextTrayClick: true),
            logger
        );
        popupDismissMouseHook.Install();
    }

    private void HidePopupFromOutsideClick(bool suppressNextTrayClick = false)
    {
        if (!popup.Visible) return;

        if (suppressNextTrayClick)
        {
            suppressTrayClickUntil = DateTime.UtcNow.Add(TrayClickSuppressWindow);
        }

        popup.Hide();
    }

    private bool ShouldSuppressTrayClick()
    {
        if (DateTime.UtcNow >= suppressTrayClickUntil) return false;

        suppressTrayClickUntil = DateTime.MinValue;
        return true;
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

    private WindowsTrayAboutUpdateStatus CurrentAboutUpdateStatus()
    {
        switch (updateSession.Phase)
        {
            case WindowsTrayUpdatePhase.Checking:
                return WindowsTrayAboutUpdateStatus.Checking();
            case WindowsTrayUpdatePhase.UpToDate:
                return WindowsTrayAboutUpdateStatus.UpToDate();
            case WindowsTrayUpdatePhase.UpdateAvailable:
                return WindowsTrayAboutUpdateStatus.UpdateAvailable(
                    updateSession.AvailableUpdate!.LatestVersion!
                );
            case WindowsTrayUpdatePhase.Downloading:
                return WindowsTrayAboutUpdateStatus.Downloading();
            case WindowsTrayUpdatePhase.Failed:
                return WindowsTrayAboutUpdateStatus.Failed(updateSession.Error ?? "");
            default:
                return WindowsTrayAboutUpdateStatus.Idle();
        }
    }

    private void ShowAbout(IWin32Window? owner = null)
    {
        if (aboutDialog is null || aboutDialog.IsDisposed)
        {
            aboutDialog = new AboutDialogForm();
            aboutDialog.OnCheckForUpdates = () =>
                _ = CheckForUpdatesAsync(aboutDialog, userInitiated: true);
            aboutDialog.FormClosed += (_, _) => aboutDialog = null;
        }

        aboutDialog.SetBrowserSource(browserSource);
        aboutDialog.SetUpdateStatus(CurrentAboutUpdateStatus());

        if (!aboutDialog.Visible)
        {
            if (owner is null)
            {
                aboutDialog.Show();
            }
            else
            {
                aboutDialog.Show(owner);
            }
        }

        aboutDialog.BringToFront();
        aboutDialog.Activate();
        _ = CheckForUpdatesAsync(aboutDialog, userInitiated: false);
    }
}
