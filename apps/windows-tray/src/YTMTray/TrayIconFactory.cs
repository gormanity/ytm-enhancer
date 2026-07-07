using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace YTMTray;

internal static class TrayIconFactory
{
    private const string PersonalizeRegistryPath =
        @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    private const string SystemUsesLightThemeValueName = "SystemUsesLightTheme";
    private static readonly Color LightThemeStatusIconColor = Color.FromArgb(32, 32, 38);
    private static readonly Color DarkThemeStatusIconColor = Color.FromArgb(232, 232, 238);

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
            StatusIconColor()
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

    private static Color StatusIconColor() =>
        IsSystemLightTheme() ? LightThemeStatusIconColor : DarkThemeStatusIconColor;

    private static bool IsSystemLightTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PersonalizeRegistryPath);
            return key?.GetValue(SystemUsesLightThemeValueName) is not int value
                || value != 0;
        }
        catch
        {
            return true;
        }
    }
}
