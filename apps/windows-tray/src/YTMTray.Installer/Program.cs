using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Text;
using YTMTray.Core;

namespace YTMTray.Installer;

[SupportedOSPlatform("windows")]
internal static partial class Program
{
    private const string InstallTitle = "Install YTM Tray";
    private const string SetupExecutableName = "YTMTray.Setup.exe";
    private const uint ErrorIcon = 0x00000010;
    private const uint OkButton = 0x00000000;

    [STAThread]
    private static int Main(string[] args)
    {
        InstallerLogger? logger = null;
        string? tempRoot = null;
        var quiet = args.Any(argument =>
            string.Equals(
                argument,
                "--quiet",
                StringComparison.OrdinalIgnoreCase
            )
        );

        try
        {
            logger = InstallerLogger.Create();
            var forwardedArguments = ForwardedArguments(args);
            var runtimeIdentifier =
                WindowsRuntimeIdentifier.CurrentOperatingSystem();
            logger.Write(
                $"selected {runtimeIdentifier} for "
                    + $"{RuntimeInformation.OSArchitecture} Windows"
            );

            tempRoot = Path.Combine(
                Path.GetTempPath(),
                "YTM Enhancer",
                "Tray",
                "Installer",
                Guid.NewGuid().ToString("N")
            );
            Directory.CreateDirectory(tempRoot);
            ExtractPackage(runtimeIdentifier, tempRoot);

            var setupPath = Path.Combine(tempRoot, SetupExecutableName);
            if (!File.Exists(setupPath))
            {
                throw new InvalidDataException(
                    $"The bundled {runtimeIdentifier} package is missing "
                        + $"{SetupExecutableName}."
                );
            }

            var startInfo = new ProcessStartInfo(setupPath)
            {
                WorkingDirectory = tempRoot,
                UseShellExecute = false
            };
            startInfo.ArgumentList.Add("install");
            foreach (var argument in forwardedArguments)
            {
                startInfo.ArgumentList.Add(argument);
            }
            startInfo.ArgumentList.Add("--runtime-identifier");
            startInfo.ArgumentList.Add(runtimeIdentifier);

            using var setup = Process.Start(startInfo)
                ?? throw new InvalidOperationException(
                    "The bundled YTM Tray setup could not be started."
                );
            setup.WaitForExit();
            logger.Write($"setup exited with code {setup.ExitCode}");
            return setup.ExitCode;
        }
        catch (Exception error)
        {
            logger ??= InstallerLogger.CreateFallback();
            logger.Write($"installer failed: {error}");
            if (!quiet)
            {
                MessageBox(
                    0,
                    $"YTM Tray installation could not complete.\n\n{error.Message}"
                        + $"\n\nDetails were written to:\n{logger.LogPath}",
                    InstallTitle,
                    OkButton | ErrorIcon
                );
            }
            return 1;
        }
        finally
        {
            if (tempRoot is not null)
            {
                Delete(tempRoot, logger);
            }
        }
    }

    private static IReadOnlyList<string> ForwardedArguments(string[] args)
    {
        var forwarded = args.ToList();
        if (
            forwarded.Count > 0
            && string.Equals(
                forwarded[0],
                "install",
                StringComparison.OrdinalIgnoreCase
            )
        )
        {
            forwarded.RemoveAt(0);
        }
        else if (
            forwarded.Count > 0
            && !forwarded[0].StartsWith("--", StringComparison.Ordinal)
        )
        {
            throw new ArgumentException(
                "The combined installer only supports installing YTM Tray."
            );
        }

        if (
            forwarded.Any(argument =>
                string.Equals(
                    argument,
                    "--runtime-identifier",
                    StringComparison.OrdinalIgnoreCase
                )
                || argument.StartsWith(
                    "--runtime-identifier=",
                    StringComparison.OrdinalIgnoreCase
                )
            )
        )
        {
            throw new ArgumentException(
                "The combined installer does not accept --runtime-identifier."
            );
        }

        if (
            forwarded.Any(argument =>
                string.Equals(
                    argument,
                    "--uninstall-worker",
                    StringComparison.OrdinalIgnoreCase
                )
            )
        )
        {
            throw new ArgumentException(
                "The combined installer only supports installing YTM Tray."
            );
        }

        return forwarded;
    }

    private static void ExtractPackage(
        string runtimeIdentifier,
        string destinationDirectory
    )
    {
        var resourceName =
            $"YTMTray.Installer.Payload.{runtimeIdentifier}.zip";
        using var package = Assembly
            .GetExecutingAssembly()
            .GetManifestResourceStream(resourceName)
            ?? throw new InvalidDataException(
                $"The installer does not contain its {runtimeIdentifier} package."
            );
        ZipPackageExtractor.Extract(package, destinationDirectory);
    }

    private static void Delete(string tempRoot, InstallerLogger? logger)
    {
        try
        {
            Directory.Delete(tempRoot, recursive: true);
        }
        catch (Exception error)
            when (error is IOException or UnauthorizedAccessException)
        {
            logger?.Write(
                $"could not remove temporary installer files at "
                    + $"{tempRoot}: {error.Message}"
            );
        }
    }

    [LibraryImport(
        "user32.dll",
        EntryPoint = "MessageBoxW",
        StringMarshalling = StringMarshalling.Utf16
    )]
    private static partial int MessageBox(
        nint windowHandle,
        string text,
        string caption,
        uint type
    );
}

internal sealed class InstallerLogger
{
    private static readonly UTF8Encoding Utf8WithoutBom = new(false);

    private InstallerLogger(string logPath)
    {
        LogPath = logPath;
    }

    public string LogPath { get; }

    public static InstallerLogger Create()
    {
        var logPath = Path.Combine(
            Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData
            ),
            "YTM Enhancer",
            "Logs",
            "YTMTray.Installer.log"
        );
        Directory.CreateDirectory(
            Path.GetDirectoryName(logPath)
                ?? throw new InvalidOperationException(
                    "The installer log path has no parent directory."
                )
        );
        return new InstallerLogger(logPath);
    }

    public static InstallerLogger CreateFallback() =>
        new(
            Path.Combine(
                Path.GetTempPath(),
                "YTMTray.Installer.log"
            )
        );

    public void Write(string message)
    {
        try
        {
            File.AppendAllText(
                LogPath,
                $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}",
                Utf8WithoutBom
            );
        }
        catch
        {
        }
    }
}
