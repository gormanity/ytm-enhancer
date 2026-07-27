namespace YTMTray.Core;

public static class WindowsTrayProcessScope
{
    private static readonly HashSet<string> InstalledExecutableNames =
        new(StringComparer.OrdinalIgnoreCase)
        {
            "YTMTray.exe",
            "YTMTray.NativeHost.exe"
        };

    public static bool IsInstalledExecutable(
        string? executablePath,
        string installRoot
    )
    {
        if (
            string.IsNullOrWhiteSpace(executablePath)
            || string.IsNullOrWhiteSpace(installRoot)
        )
        {
            return false;
        }

        var normalizedExecutablePath = Path.GetFullPath(executablePath);
        if (
            !InstalledExecutableNames.Contains(
                Path.GetFileName(normalizedExecutablePath)
            )
        )
        {
            return false;
        }

        var executableDirectory = Path.GetDirectoryName(
            normalizedExecutablePath
        );
        if (string.IsNullOrWhiteSpace(executableDirectory))
        {
            return false;
        }

        return string.Equals(
            Path.TrimEndingDirectorySeparator(
                Path.GetFullPath(executableDirectory)
            ),
            Path.TrimEndingDirectorySeparator(Path.GetFullPath(installRoot)),
            StringComparison.OrdinalIgnoreCase
        );
    }
}
