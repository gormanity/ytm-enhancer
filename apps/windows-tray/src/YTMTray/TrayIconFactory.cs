using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;

namespace YTMTray;

internal static class TrayIconFactory
{
    private static readonly Color StatusIconColor = Color.FromArgb(232, 232, 238);

    public static Icon Create(bool isPlaying)
    {
        using var bitmap = new Bitmap(32, 32);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        graphics.SmoothingMode = SmoothingMode.AntiAlias;
        graphics.PixelOffsetMode = PixelOffsetMode.HighQuality;

        var resourceName = isPlaying
            ? StatusSvgIconRenderer.PlayingResourceName
            : StatusSvgIconRenderer.IdleResourceName;

        StatusSvgIconRenderer.Draw(
            graphics,
            resourceName,
            new Rectangle(2, 2, 28, 28),
            StatusIconColor
        );

        var handle = bitmap.GetHicon();
        try
        {
            return (Icon)Icon.FromHandle(handle).Clone();
        }
        finally
        {
            DestroyIcon(handle);
        }
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DestroyIcon(IntPtr handle);
}
