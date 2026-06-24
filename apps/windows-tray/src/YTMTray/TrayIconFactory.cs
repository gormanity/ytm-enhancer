using System.Drawing;
using System.Runtime.InteropServices;

namespace YTMTray;

internal static class TrayIconFactory
{
    public static Icon Create(bool isPlaying)
    {
        using var bitmap = new Bitmap(32, 32);
        using var graphics = Graphics.FromImage(bitmap);
        graphics.Clear(Color.Transparent);
        graphics.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        using var ring = new Pen(isPlaying ? Color.FromArgb(255, 230, 72, 72) : Color.White, 3);
        using var fill = new SolidBrush(isPlaying ? Color.White : Color.FromArgb(210, 210, 210));

        graphics.DrawEllipse(ring, 4, 4, 24, 24);
        if (isPlaying)
        {
            graphics.FillPolygon(fill, [new Point(13, 10), new Point(13, 22), new Point(23, 16)]);
        }
        else
        {
            graphics.FillRectangle(fill, 12, 10, 3, 12);
            graphics.FillRectangle(fill, 18, 10, 3, 12);
        }

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
