using System.Runtime.InteropServices;

namespace YTMTray.Core;

public static class WindowsRuntimeIdentifier
{
    public static string CurrentOperatingSystem() =>
        FromArchitecture(RuntimeInformation.OSArchitecture);

    public static string FromArchitecture(Architecture architecture) =>
        architecture switch
        {
            Architecture.X64 => "win-x64",
            Architecture.Arm64 => "win-arm64",
            _ => throw new PlatformNotSupportedException(
                $"YTM Tray does not support the {architecture.ToString().ToLowerInvariant()} Windows architecture."
            )
        };
}
