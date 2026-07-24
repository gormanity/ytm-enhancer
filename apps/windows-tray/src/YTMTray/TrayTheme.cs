using System.Drawing;
using Microsoft.Win32;

namespace YTMTray;

internal sealed class TrayTheme
{
    private const string PersonalizeRegistryPath =
        @"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    private const string AppsUseLightThemeValueName = "AppsUseLightTheme";
    private const string SystemUsesLightThemeValueName = "SystemUsesLightTheme";

    private static readonly TrayTheme Light = new()
    {
        PopupSurfaceColor = Color.FromArgb(248, 249, 252),
        PopupSurfaceTopColor = Color.White,
        PopupBorderColor = Color.FromArgb(186, 190, 200),
        PopupDividerColor = Color.FromArgb(214, 217, 224),
        AboutSurfaceColor = Color.FromArgb(248, 249, 252),
        AboutPanelColor = Color.White,
        PrimaryTextColor = Color.FromArgb(24, 25, 30),
        SecondaryTextColor = Color.FromArgb(62, 65, 73),
        TertiaryTextColor = Color.FromArgb(104, 109, 120),
        AccentColor = Color.FromArgb(255, 32, 18),
        WarningColor = Color.FromArgb(176, 90, 0),
        SuccessColor = Color.FromArgb(35, 128, 74),
        CloseIconColor = Color.FromArgb(88, 92, 102),
        ControlHoverColor = Color.FromArgb(18, 0, 0, 0),
        ControlPressedColor = Color.FromArgb(32, 0, 0, 0),
        ControlIconColor = Color.FromArgb(28, 30, 36),
        ControlInactiveIconColor = Color.FromArgb(118, 123, 134),
        ControlDisabledIconColor = Color.FromArgb(188, 192, 202),
        ActionTextColor = Color.FromArgb(38, 41, 48),
        ActionIconColor = Color.FromArgb(38, 41, 48),
        ProgressTrackColor = Color.FromArgb(196, 200, 210),
        ProgressDisabledTrackColor = Color.FromArgb(226, 228, 234),
        ProgressDisabledFillColor = Color.FromArgb(188, 192, 202),
        ArtworkBackgroundColor = Color.FromArgb(238, 240, 245),
        ArtworkBorderColor = Color.FromArgb(206, 210, 220),
        ArtworkPlaceholderColor = Color.FromArgb(112, 117, 128),
        DialogButtonBackgroundColor = Color.White,
        DialogButtonBorderColor = Color.FromArgb(176, 181, 192),
        StatusIconPaintColor = Color.FromArgb(32, 32, 38)
    };

    private static readonly TrayTheme Dark = new()
    {
        PopupSurfaceColor = Color.FromArgb(8, 8, 9),
        PopupSurfaceTopColor = Color.FromArgb(18, 18, 20),
        PopupBorderColor = Color.FromArgb(88, 88, 94),
        PopupDividerColor = Color.FromArgb(58, 58, 62),
        AboutSurfaceColor = Color.FromArgb(14, 14, 16),
        AboutPanelColor = Color.FromArgb(24, 24, 27),
        PrimaryTextColor = Color.White,
        SecondaryTextColor = Color.FromArgb(202, 202, 208),
        TertiaryTextColor = Color.FromArgb(145, 145, 152),
        AccentColor = Color.FromArgb(255, 32, 18),
        WarningColor = Color.FromArgb(255, 158, 61),
        SuccessColor = Color.FromArgb(90, 210, 135),
        CloseIconColor = Color.FromArgb(166, 166, 174),
        ControlHoverColor = Color.FromArgb(42, 255, 255, 255),
        ControlPressedColor = Color.FromArgb(58, 255, 255, 255),
        ControlIconColor = Color.White,
        ControlInactiveIconColor = Color.FromArgb(132, 132, 138),
        ControlDisabledIconColor = Color.FromArgb(92, 92, 98),
        ActionTextColor = Color.FromArgb(224, 224, 230),
        ActionIconColor = Color.FromArgb(224, 224, 230),
        ProgressTrackColor = Color.FromArgb(76, 76, 80),
        ProgressDisabledTrackColor = Color.FromArgb(42, 42, 48),
        ProgressDisabledFillColor = Color.FromArgb(88, 88, 96),
        ArtworkBackgroundColor = Color.FromArgb(23, 23, 23),
        ArtworkBorderColor = Color.FromArgb(72, 72, 72),
        ArtworkPlaceholderColor = Color.FromArgb(150, 150, 150),
        DialogButtonBackgroundColor = Color.FromArgb(32, 32, 36),
        DialogButtonBorderColor = Color.FromArgb(78, 78, 84),
        StatusIconPaintColor = Color.FromArgb(232, 232, 238)
    };

    private TrayTheme() { }

    public static TrayTheme CurrentApp => ForLightTheme(IsAppLightTheme());

    public static Color StatusIconColor() =>
        ForLightTheme(IsSystemLightTheme()).StatusIconPaintColor;

    public required Color PopupSurfaceColor { get; init; }
    public required Color PopupSurfaceTopColor { get; init; }
    public required Color PopupBorderColor { get; init; }
    public required Color PopupDividerColor { get; init; }
    public required Color AboutSurfaceColor { get; init; }
    public required Color AboutPanelColor { get; init; }
    public required Color PrimaryTextColor { get; init; }
    public required Color SecondaryTextColor { get; init; }
    public required Color TertiaryTextColor { get; init; }
    public required Color AccentColor { get; init; }
    public required Color WarningColor { get; init; }
    public required Color SuccessColor { get; init; }
    public required Color CloseIconColor { get; init; }
    public required Color ControlHoverColor { get; init; }
    public required Color ControlPressedColor { get; init; }
    public required Color ControlIconColor { get; init; }
    public required Color ControlInactiveIconColor { get; init; }
    public required Color ControlDisabledIconColor { get; init; }
    public required Color ActionTextColor { get; init; }
    public required Color ActionIconColor { get; init; }
    public required Color ProgressTrackColor { get; init; }
    public required Color ProgressDisabledTrackColor { get; init; }
    public required Color ProgressDisabledFillColor { get; init; }
    public required Color ArtworkBackgroundColor { get; init; }
    public required Color ArtworkBorderColor { get; init; }
    public required Color ArtworkPlaceholderColor { get; init; }
    public required Color DialogButtonBackgroundColor { get; init; }
    public required Color DialogButtonBorderColor { get; init; }
    internal required Color StatusIconPaintColor { get; init; }

    private static TrayTheme ForLightTheme(bool isLightTheme) =>
        isLightTheme ? Light : Dark;

    private static bool IsAppLightTheme() =>
        ReadLightThemePreference(AppsUseLightThemeValueName);

    private static bool IsSystemLightTheme() =>
        ReadLightThemePreference(SystemUsesLightThemeValueName);

    private static bool ReadLightThemePreference(string valueName)
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(PersonalizeRegistryPath);
            return key?.GetValue(valueName) is not int value || value != 0;
        }
        catch
        {
            return true;
        }
    }
}
