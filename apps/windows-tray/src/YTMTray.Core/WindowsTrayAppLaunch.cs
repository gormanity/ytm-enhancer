using System.Diagnostics;

namespace YTMTray.Core;

public static class WindowsTrayAppLaunch
{
    private const string TrayExecutableName = "YTMTray.exe";

    // Released updaters before the explicit launch flag still identify their
    // handoff by waiting for the running tray process to exit.
    public static bool ShouldLaunchAfterInstall(
        bool quiet,
        bool launchAfterInstallRequested,
        bool waitForProcessRequested
    ) => !quiet || launchAfterInstallRequested || waitForProcessRequested;

    public static ProcessStartInfo CreateStartInfo(string installRoot)
    {
        if (string.IsNullOrWhiteSpace(installRoot))
        {
            throw new ArgumentException(
                "The YTM Tray install root cannot be empty.",
                nameof(installRoot)
            );
        }

        var normalizedInstallRoot = Path.TrimEndingDirectorySeparator(
            Path.GetFullPath(installRoot)
        );
        return new ProcessStartInfo(
            Path.Combine(normalizedInstallRoot, TrayExecutableName)
        )
        {
            WorkingDirectory = normalizedInstallRoot,
            UseShellExecute = false
        };
    }
}
