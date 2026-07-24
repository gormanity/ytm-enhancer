using System.Drawing;

namespace YTMTray.Core;

public static class ArtworkLayout
{
    public static RectangleF AspectFit(Size sourceSize, Rectangle bounds)
    {
        if (
            sourceSize.Width <= 0
            || sourceSize.Height <= 0
            || bounds.Width <= 0
            || bounds.Height <= 0
        )
        {
            return RectangleF.Empty;
        }

        var widthScale = bounds.Width / (float)sourceSize.Width;
        var heightScale = bounds.Height / (float)sourceSize.Height;
        var scale = Math.Min(widthScale, heightScale);
        var width = sourceSize.Width * scale;
        var height = sourceSize.Height * scale;

        return new RectangleF(
            bounds.X + ((bounds.Width - width) / 2),
            bounds.Y + ((bounds.Height - height) / 2),
            width,
            height
        );
    }
}
