namespace YTMTray.Core;

public sealed class NativeAppLogger
{
    public string Path { get; }

    public NativeAppLogger(string? path = null)
    {
        Path =
            path
            ?? Environment.GetEnvironmentVariable("YTM_TRAY_LOG_PATH")
            ?? System.IO.Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "YTM Enhancer",
                "Tray",
                "tray.log"
            );
    }

    public void Log(string message)
    {
        try
        {
            var directory = System.IO.Path.GetDirectoryName(Path);
            if (!string.IsNullOrEmpty(directory))
            {
                Directory.CreateDirectory(directory);
            }

            File.AppendAllText(
                Path,
                $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}"
            );
        }
        catch
        {
            // Diagnostics must never break native messaging.
        }
    }
}
