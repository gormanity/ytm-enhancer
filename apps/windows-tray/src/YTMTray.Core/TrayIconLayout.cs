using System.Drawing;

namespace YTMTray.Core;

public static class TrayIconLayout
{
    private const int IdleOverscan = 1;

    public static Rectangle RenderBounds(bool isPlaying, Size canvas)
    {
        var canvasBounds = new Rectangle(Point.Empty, canvas);
        return isPlaying
            ? canvasBounds
            : Rectangle.Inflate(canvasBounds, IdleOverscan, IdleOverscan);
    }
}
