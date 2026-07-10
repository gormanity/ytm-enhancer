using System.Drawing;

namespace YTMTray.Core;

public static class TrayPopupPlacement
{
    public const int EdgePadding = 8;
    public const int AnchorGap = 10;
    public const int AnchorHorizontalInset = 24;

    public static Point Calculate(
        Rectangle workingArea,
        Size popupSize,
        Point? anchorPoint = null
    )
    {
        var anchor = anchorPoint ?? new Point(workingArea.Right, workingArea.Bottom);
        var maxX = Math.Max(
            workingArea.Left + EdgePadding,
            workingArea.Right - popupSize.Width - EdgePadding
        );
        var targetRight = Math.Min(
            anchor.X + AnchorHorizontalInset,
            workingArea.Right - EdgePadding
        );
        var targetBottom = Math.Min(
            anchor.Y - AnchorGap,
            workingArea.Bottom - AnchorGap
        );
        var maxY = Math.Max(
            workingArea.Top + EdgePadding,
            workingArea.Bottom - popupSize.Height - EdgePadding
        );

        return new Point(
            Math.Clamp(
                targetRight - popupSize.Width,
                workingArea.Left + EdgePadding,
                maxX
            ),
            Math.Clamp(
                targetBottom - popupSize.Height,
                workingArea.Top + EdgePadding,
                maxY
            )
        );
    }
}
