using System.Drawing;
using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal sealed class TrayController : ITrayController, IDisposable
{
    private const int PopupEdgePadding = 8;
    private const int TaskbarFlyoutClearance = 112;

    private readonly NotifyIcon notifyIcon;
    private readonly PlaybackPopupForm popup = new();
    private readonly Icon idleIcon;
    private readonly Icon playingIcon;

    public Action? OnShuffle { get; set; }
    public Action? OnPrevious { get; set; }
    public Action? OnTogglePlay { get; set; }
    public Action? OnNext { get; set; }
    public Action? OnRepeat { get; set; }
    public Action<double>? OnSeek { get; set; }
    public Action? OnFocusYouTubeMusic { get; set; }
    public Action? OnQuit { get; set; }

    public TrayController(string initialStatus)
    {
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
        menu.Items.Add("About YTM Tray", null, (_, _) => ShowAbout());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Quit", null, (_, _) => OnQuit?.Invoke());
        return menu;
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
