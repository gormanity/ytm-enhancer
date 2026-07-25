using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Runtime.InteropServices.ComTypes;
using System.Runtime.Versioning;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Win32;
using YTMTray.Core;

namespace YTMTray.Setup;

[SupportedOSPlatform("windows")]
internal static class Program
{
    private const string InstallTitle = "Install YTM Tray";
    private const string UninstallTitle = "Uninstall YTM Tray";

    [STAThread]
    private static int Main(string[] args)
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        var quiet = args.Any(argument =>
            string.Equals(argument, "--quiet", StringComparison.OrdinalIgnoreCase)
        );
        SetupLogger? logger = null;

        try
        {
            var options = SetupOptions.Parse(args);
            logger = new SetupLogger(options.LogPath);
            logger.Write(
                $"starting {options.Action.ToString().ToLowerInvariant()}"
                    + (options.IsUninstallWorker ? " worker" : "")
            );

            var installer = new WindowsTrayInstaller(options, logger);
            if (options.Action == SetupAction.Install)
            {
                installer.Install();
                if (!options.Quiet)
                {
                    MessageBox.Show(
                        "YTM Tray was installed successfully.\n\n"
                            + "Open YTM Tray from the Start menu, then enable Connected Apps "
                            + "in YTM Enhancer.",
                        InstallTitle,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            else if (options.IsUninstallWorker)
            {
                installer.UninstallFromWorker();
                if (!options.Quiet)
                {
                    MessageBox.Show(
                        "YTM Tray was uninstalled successfully.",
                        UninstallTitle,
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }
            }
            else
            {
                installer.StartUninstallWorker();
            }

            logger.Write("setup completed successfully");
            return 0;
        }
        catch (Exception error)
        {
            logger ??= SetupLogger.CreateFallback();
            logger.Write($"setup failed: {error}");
            if (!quiet)
            {
                MessageBox.Show(
                    $"YTM Tray setup could not complete.\n\n{error.Message}\n\n"
                        + $"Details were written to:\n{logger.LogPath}",
                    args.Any(argument =>
                        string.Equals(
                            argument,
                            "uninstall",
                            StringComparison.OrdinalIgnoreCase
                        )
                    )
                        ? UninstallTitle
                        : InstallTitle,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error
                );
            }

            return 1;
        }
    }
}

internal enum SetupAction
{
    Install,
    Uninstall
}

internal sealed record SetupOptions(
    SetupAction Action,
    bool Quiet,
    string InstallRoot,
    string RuntimeIdentifier,
    IReadOnlyList<string> AdditionalAllowedOrigins,
    int? WaitForProcessId,
    bool IsUninstallWorker,
    string LogPath
)
{
    private const string UninstallRegistryPath =
        @"Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray";
    private static readonly HashSet<string> SupportedRuntimeIdentifiers =
    [
        "win-x64",
        "win-arm64"
    ];

    public static SetupOptions Parse(string[] args)
    {
        var action = SetupAction.Install;
        var actionWasSpecified = false;
        SetupAction? specifiedAction = null;
        var quiet = false;
        string? installRoot = null;
        string? runtimeIdentifier = null;
        var additionalAllowedOrigins = new List<string>();
        int? waitForProcessId = null;
        var isUninstallWorker = false;
        string? logPath = null;

        for (var index = 0; index < args.Length; index++)
        {
            var argument = args[index];
            if (!argument.StartsWith("--", StringComparison.Ordinal))
            {
                if (actionWasSpecified)
                {
                    throw new ArgumentException($"Unexpected setup argument: {argument}");
                }

                action = argument.ToLowerInvariant() switch
                {
                    "install" => SetupAction.Install,
                    "uninstall" => SetupAction.Uninstall,
                    _ => throw new ArgumentException($"Unknown setup action: {argument}")
                };
                specifiedAction = action;
                actionWasSpecified = true;
                continue;
            }

            var (option, inlineValue) = SplitOption(argument);
            switch (option)
            {
                case "--quiet":
                    RequireFlag(option, inlineValue);
                    quiet = true;
                    break;
                case "--install-root":
                    installRoot = ReadValue(args, ref index, option, inlineValue);
                    break;
                case "--runtime-identifier":
                    runtimeIdentifier = ReadValue(args, ref index, option, inlineValue);
                    break;
                case "--additional-allowed-origin":
                    additionalAllowedOrigins.Add(
                        ReadValue(args, ref index, option, inlineValue)
                    );
                    break;
                case "--wait-for-process":
                    var processIdValue = ReadValue(args, ref index, option, inlineValue);
                    if (
                        !int.TryParse(processIdValue, out var processId)
                        || processId <= 0
                    )
                    {
                        throw new ArgumentException(
                            $"{option} requires a positive process ID."
                        );
                    }

                    waitForProcessId = processId;
                    break;
                case "--uninstall-worker":
                    RequireFlag(option, inlineValue);
                    isUninstallWorker = true;
                    action = SetupAction.Uninstall;
                    break;
                case "--log-path":
                    logPath = ReadValue(args, ref index, option, inlineValue);
                    break;
                default:
                    throw new ArgumentException($"Unknown setup option: {option}");
            }
        }

        if (
            isUninstallWorker
            && specifiedAction == SetupAction.Install
        )
        {
            throw new ArgumentException(
                "--uninstall-worker cannot be combined with the install action."
            );
        }

        installRoot = NormalizePath(
            string.IsNullOrWhiteSpace(installRoot)
                ? ExistingInstallRoot() ?? DefaultInstallRoot()
                : installRoot
        );

        runtimeIdentifier = string.IsNullOrWhiteSpace(runtimeIdentifier)
            ? DefaultRuntimeIdentifier()
            : runtimeIdentifier.Trim().ToLowerInvariant();
        if (!SupportedRuntimeIdentifiers.Contains(runtimeIdentifier))
        {
            throw new ArgumentException(
                $"Unsupported runtime identifier: {runtimeIdentifier}. "
                    + "Expected win-x64 or win-arm64."
            );
        }

        logPath = NormalizePath(
            string.IsNullOrWhiteSpace(logPath)
                ? Path.Combine(
                    Environment.GetFolderPath(
                        Environment.SpecialFolder.LocalApplicationData
                    ),
                    "YTM Enhancer",
                    "Logs",
                    "YTMTray.Setup.log"
                )
                : logPath
        );

        return new SetupOptions(
            action,
            quiet,
            installRoot,
            runtimeIdentifier,
            additionalAllowedOrigins,
            waitForProcessId,
            isUninstallWorker,
            logPath
        );
    }

    private static (string Option, string? InlineValue) SplitOption(string argument)
    {
        var separator = argument.IndexOf('=');
        return separator < 0
            ? (argument.ToLowerInvariant(), null)
            : (
                argument[..separator].ToLowerInvariant(),
                argument[(separator + 1)..]
            );
    }

    private static string ReadValue(
        string[] args,
        ref int index,
        string option,
        string? inlineValue
    )
    {
        var value = inlineValue;
        if (value is null)
        {
            if (index + 1 >= args.Length)
            {
                throw new ArgumentException($"{option} requires a value.");
            }

            value = args[++index];
        }

        if (string.IsNullOrWhiteSpace(value))
        {
            throw new ArgumentException($"{option} requires a nonempty value.");
        }

        return value;
    }

    private static void RequireFlag(string option, string? inlineValue)
    {
        if (inlineValue is not null)
        {
            throw new ArgumentException($"{option} does not accept a value.");
        }
    }

    private static string NormalizePath(string path) =>
        Path.TrimEndingDirectorySeparator(Path.GetFullPath(path));

    private static string? ExistingInstallRoot()
    {
        try
        {
            using var currentUser = RegistryKey.OpenBaseKey(
                RegistryHive.CurrentUser,
                RegistryView.Registry64
            );
            using var key = currentUser.OpenSubKey(UninstallRegistryPath);
            var installLocation = key?.GetValue(
                "InstallLocation",
                null,
                RegistryValueOptions.DoNotExpandEnvironmentNames
            ) as string;
            return string.IsNullOrWhiteSpace(installLocation)
                ? null
                : installLocation;
        }
        catch (Exception error)
            when (error is IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    private static string DefaultInstallRoot() =>
        Path.Combine(
            Environment.GetFolderPath(
                Environment.SpecialFolder.LocalApplicationData
            ),
            "YTM Enhancer",
            "Tray"
        );

    private static string DefaultRuntimeIdentifier() =>
        WindowsRuntimeIdentifier.CurrentOperatingSystem();
}

internal sealed class SetupLogger
{
    private readonly object syncRoot = new();

    public SetupLogger(string logPath)
    {
        LogPath = logPath;
        EnsureParentDirectory(logPath);
    }

    public string LogPath { get; }

    public void Write(string message)
    {
        var line = $"{DateTimeOffset.Now:O} {message}{Environment.NewLine}";
        lock (syncRoot)
        {
            try
            {
                File.AppendAllText(LogPath, line, new UTF8Encoding(false));
            }
            catch
            {
                // Logging must not obscure the original setup result.
            }
        }
    }

    public static SetupLogger CreateFallback() =>
        new(
            Path.Combine(
                Path.GetTempPath(),
                $"YTMTray.Setup-{DateTime.UtcNow:yyyyMMdd-HHmmss}.log"
            )
        );

    private static void EnsureParentDirectory(string path)
    {
        var parent = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(parent))
        {
            Directory.CreateDirectory(parent);
        }
    }
}

internal sealed class WindowsTrayInstaller
{
    private const string HostName = "com.gormanity.ytm_enhancer.tray";
    private const string Description = "YTM Enhancer Windows Tray Connector";
    private const string ProductName = "YTM Tray";
    private const string Publisher = "YTM Enhancer";
    private const string TrayExecutableName = "YTMTray.exe";
    private const string NativeHostExecutableName = "YTMTray.NativeHost.exe";
    private const string SetupExecutableName = "YTMTray.Setup.exe";
    private const string ReleaseMetadataName = "release.json";
    private const string ChromiumManifestName =
        "com.gormanity.ytm_enhancer.tray.json";
    private const string FirefoxManifestName =
        "com.gormanity.ytm_enhancer.tray.firefox.json";
    private const string UninstallRegistryPath =
        @"Software\Microsoft\Windows\CurrentVersion\Uninstall\YTMTray";
    private const string WorkerDirectoryName = "YTMTray.Setup";
    private static readonly TimeSpan WorkerMaximumAge = TimeSpan.FromDays(1);
    private static readonly TimeSpan ProcessExitTimeout = TimeSpan.FromSeconds(60);
    private static readonly UTF8Encoding Utf8WithoutBom = new(false);
    private static readonly Regex ExtensionIdPattern = new(
        "^[a-p]{32}$",
        RegexOptions.CultureInvariant
    );
    private static readonly Regex AllowedOriginPattern = new(
        "^chrome-extension://[a-p]{32}/$",
        RegexOptions.CultureInvariant
    );
    private static readonly string[] DefaultAllowedOrigins =
    [
        "chrome-extension://pggblbpjleekkobiinobaeeefnimgljh/",
        "chrome-extension://akkbieodbakphpfdibailajdknnmmoca/",
        "chrome-extension://bilcedjabgiedoamakekncokccabdccp/",
        "chrome-extension://gamefnibdabclmkngggcjghpbhjmajkm/"
    ];
    private static readonly string[] DefaultAllowedFirefoxExtensions =
    [
        "ytm-enhancer@gormanity"
    ];
    private static readonly string[] NativeMessagingRegistryPaths =
    [
        $@"Software\Google\Chrome\NativeMessagingHosts\{HostName}",
        $@"Software\Microsoft\Edge\NativeMessagingHosts\{HostName}",
        $@"Software\Mozilla\NativeMessagingHosts\{HostName}"
    ];
    private static readonly string[] InstalledFileNames =
    [
        TrayExecutableName,
        NativeHostExecutableName,
        SetupExecutableName,
        ReleaseMetadataName,
        ChromiumManifestName,
        FirefoxManifestName
    ];
    private static readonly string[] LegacyInstalledFileNames =
    [
        "install-native-hosts.ps1",
        "uninstall-native-hosts.ps1",
        "Install YTM Tray.cmd",
        "Uninstall YTM Tray.cmd",
        "run-update-installer.ps1"
    ];
    private static readonly string[] RuntimeStateFileNames =
    [
        "tray.log",
        "active-browser.json"
    ];

    private readonly SetupOptions options;
    private readonly SetupLogger logger;
    private readonly string sourceRoot;
    private readonly string trayExecutablePath;
    private readonly string nativeHostExecutablePath;
    private readonly string setupExecutablePath;
    private readonly string releaseMetadataPath;
    private readonly string chromiumManifestPath;
    private readonly string firefoxManifestPath;
    private readonly string startMenuFolder;
    private readonly string startMenuAppShortcutPath;
    private readonly string startMenuUninstallShortcutPath;
    private readonly string workerRoot;

    public WindowsTrayInstaller(SetupOptions options, SetupLogger logger)
    {
        this.options = options;
        this.logger = logger;
        sourceRoot = Path.TrimEndingDirectorySeparator(AppContext.BaseDirectory);
        trayExecutablePath = Path.Combine(options.InstallRoot, TrayExecutableName);
        nativeHostExecutablePath = Path.Combine(
            options.InstallRoot,
            NativeHostExecutableName
        );
        setupExecutablePath = Path.Combine(options.InstallRoot, SetupExecutableName);
        releaseMetadataPath = Path.Combine(options.InstallRoot, ReleaseMetadataName);
        chromiumManifestPath = Path.Combine(
            options.InstallRoot,
            ChromiumManifestName
        );
        firefoxManifestPath = Path.Combine(
            options.InstallRoot,
            FirefoxManifestName
        );
        startMenuFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Microsoft",
            "Windows",
            "Start Menu",
            "Programs",
            "YTM Enhancer"
        );
        startMenuAppShortcutPath = Path.Combine(startMenuFolder, "YTM Tray.lnk");
        startMenuUninstallShortcutPath = Path.Combine(
            startMenuFolder,
            "Uninstall YTM Tray.lnk"
        );
        workerRoot = Path.Combine(Path.GetTempPath(), WorkerDirectoryName);
    }

    public void Install()
    {
        ReapStaleWorkers();
        var payload = ValidatePayload();
        WaitForRequestedProcess();

        using var backup = InstallBackup.Capture(
            options.InstallRoot,
            AllManagedInstalledFileNames(),
            [startMenuAppShortcutPath, startMenuUninstallShortcutPath],
            [.. NativeMessagingRegistryPaths, UninstallRegistryPath],
            logger
        );

        try
        {
            Directory.CreateDirectory(options.InstallRoot);
            StopRunningTrayProcesses();

            CopyFileWithRetry(payload.TrayExecutablePath, trayExecutablePath);
            CopyFileWithRetry(
                payload.NativeHostExecutablePath,
                nativeHostExecutablePath
            );
            CopyFileWithRetry(payload.SetupExecutablePath, setupExecutablePath);
            CopyFileWithRetry(payload.ReleaseMetadataPath, releaseMetadataPath);

            WriteNativeMessagingManifests();
            RegisterNativeMessagingHosts();
            RemoveLegacyInstalledFiles();
            InstallStartMenuShortcuts();
            RegisterUninstallEntry(payload.Version);

            backup.Commit();
            logger.Write($"installed {ProductName} {payload.Version} to {options.InstallRoot}");
        }
        catch
        {
            logger.Write("installation failed; restoring previous installation");
            backup.Restore();
            RemoveDirectoryIfEmpty(startMenuFolder);
            throw;
        }
    }

    public void StartUninstallWorker()
    {
        ReapStaleWorkers();
        WaitForRequestedProcess();

        var workerDirectory = Path.Combine(
            workerRoot,
            $"uninstall-{DateTime.UtcNow:yyyyMMddHHmmss}-{Guid.NewGuid():N}"
        );
        Directory.CreateDirectory(workerDirectory);
        var workerExecutablePath = Path.Combine(
            workerDirectory,
            SetupExecutableName
        );
        var sourceSetupPath = File.Exists(setupExecutablePath)
            ? setupExecutablePath
            : CurrentExecutablePath();
        ValidateFile(sourceSetupPath, SetupExecutableName);
        CopyFileWithRetry(sourceSetupPath, workerExecutablePath);

        var startInfo = new ProcessStartInfo(workerExecutablePath)
        {
            WorkingDirectory = workerDirectory,
            UseShellExecute = false,
            CreateNoWindow = options.Quiet
        };
        startInfo.ArgumentList.Add("--uninstall-worker");
        startInfo.ArgumentList.Add("--install-root");
        startInfo.ArgumentList.Add(options.InstallRoot);
        startInfo.ArgumentList.Add("--runtime-identifier");
        startInfo.ArgumentList.Add(options.RuntimeIdentifier);
        startInfo.ArgumentList.Add("--wait-for-process");
        startInfo.ArgumentList.Add(Environment.ProcessId.ToString());
        startInfo.ArgumentList.Add("--log-path");
        startInfo.ArgumentList.Add(options.LogPath);
        if (options.Quiet)
        {
            startInfo.ArgumentList.Add("--quiet");
        }

        var worker = Process.Start(startInfo)
            ?? throw new InvalidOperationException(
                "The YTM Tray uninstall worker could not be started."
            );
        logger.Write($"started uninstall worker {worker.Id} from {workerDirectory}");
    }

    public void UninstallFromWorker()
    {
        WaitForRequestedProcess();
        StopRunningTrayProcesses();

        foreach (var registryPath in NativeMessagingRegistryPaths)
        {
            DeleteRegistryTree(registryPath);
        }

        DeleteRegistryTree(UninstallRegistryPath);
        RemoveStartMenuShortcuts();

        foreach (var fileName in AllManagedInstalledFileNames())
        {
            DeleteFileWithRetry(Path.Combine(options.InstallRoot, fileName));
        }

        RemoveDirectoryIfEmpty(options.InstallRoot);
        RemoveDefaultInstallParentIfEmpty();
        logger.Write($"uninstalled {ProductName} from {options.InstallRoot}");
        ScheduleCurrentWorkerCleanup();
    }

    private PackagedPayload ValidatePayload()
    {
        var trayPath = Path.Combine(sourceRoot, TrayExecutableName);
        var nativeHostPath = Path.Combine(sourceRoot, NativeHostExecutableName);
        var setupPath = Path.Combine(sourceRoot, SetupExecutableName);
        var metadataPath = Path.Combine(sourceRoot, ReleaseMetadataName);

        ValidateFile(trayPath, TrayExecutableName);
        ValidateFile(nativeHostPath, NativeHostExecutableName);
        ValidateFile(setupPath, SetupExecutableName);
        ValidateFile(metadataPath, ReleaseMetadataName);

        string version;
        string runtimeIdentifier;
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllText(metadataPath));
            var root = document.RootElement;
            version = ReadRequiredMetadataString(root, "version");
            runtimeIdentifier = ReadRequiredMetadataString(
                root,
                "runtimeIdentifier"
            );
        }
        catch (JsonException error)
        {
            throw new InvalidDataException(
                $"{ReleaseMetadataName} is not valid JSON.",
                error
            );
        }

        if (
            !string.Equals(
                runtimeIdentifier,
                options.RuntimeIdentifier,
                StringComparison.OrdinalIgnoreCase
            )
        )
        {
            throw new InvalidDataException(
                $"This package targets {runtimeIdentifier}, but setup was asked to install "
                    + $"{options.RuntimeIdentifier}."
            );
        }

        foreach (var origin in options.AdditionalAllowedOrigins)
        {
            NormalizeAllowedOrigin(origin);
        }

        logger.Write(
            $"validated {ProductName} {version} payload for {runtimeIdentifier}"
        );
        return new PackagedPayload(
            trayPath,
            nativeHostPath,
            setupPath,
            metadataPath,
            version
        );
    }

    private static string ReadRequiredMetadataString(
        JsonElement root,
        string propertyName
    )
    {
        if (
            !root.TryGetProperty(propertyName, out var property)
            || property.ValueKind != JsonValueKind.String
            || string.IsNullOrWhiteSpace(property.GetString())
        )
        {
            throw new InvalidDataException(
                $"{ReleaseMetadataName} is missing {propertyName}."
            );
        }

        return property.GetString()!;
    }

    private static void ValidateFile(string path, string displayName)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException(
                $"The setup package is missing {displayName}. Extract the complete archive "
                    + "before running setup.",
                path
            );
        }

        if (new FileInfo(path).Length == 0)
        {
            throw new InvalidDataException(
                $"The setup package contains an empty {displayName} file."
            );
        }
    }

    private void WriteNativeMessagingManifests()
    {
        var allowedOrigins = DefaultAllowedOrigins
            .Concat(options.AdditionalAllowedOrigins.Select(NormalizeAllowedOrigin))
            .Distinct(StringComparer.Ordinal)
            .ToArray();
        var chromiumManifest = JsonSerializer.Serialize(
            new
            {
                name = HostName,
                description = Description,
                path = nativeHostExecutablePath,
                type = "stdio",
                allowed_origins = allowedOrigins
            },
            new JsonSerializerOptions { WriteIndented = true }
        );
        var firefoxManifest = JsonSerializer.Serialize(
            new
            {
                name = HostName,
                description = Description,
                path = nativeHostExecutablePath,
                type = "stdio",
                allowed_extensions = DefaultAllowedFirefoxExtensions
            },
            new JsonSerializerOptions { WriteIndented = true }
        );

        WriteTextFileWithRetry(chromiumManifestPath, chromiumManifest + "\n");
        WriteTextFileWithRetry(firefoxManifestPath, firefoxManifest + "\n");
        logger.Write("wrote Chromium and Firefox native messaging manifests");
    }

    private static string NormalizeAllowedOrigin(string origin)
    {
        var normalized = origin.Trim();
        if (ExtensionIdPattern.IsMatch(normalized))
        {
            normalized = $"chrome-extension://{normalized}/";
        }

        if (!AllowedOriginPattern.IsMatch(normalized))
        {
            throw new ArgumentException($"Invalid native messaging origin: {origin}");
        }

        return normalized;
    }

    private void RegisterNativeMessagingHosts()
    {
        using var currentUser = RegistryKey.OpenBaseKey(
            RegistryHive.CurrentUser,
            RegistryView.Registry64
        );
        foreach (var registryPath in NativeMessagingRegistryPaths)
        {
            using var key = currentUser.CreateSubKey(registryPath, true)
                ?? throw new InvalidOperationException(
                    $"Could not create registry key HKCU\\{registryPath}."
                );
            var manifestPath = registryPath.Contains(
                @"\Mozilla\",
                StringComparison.Ordinal
            )
                ? firefoxManifestPath
                : chromiumManifestPath;
            key.SetValue("", manifestPath, RegistryValueKind.String);
            logger.Write($"registered HKCU\\{registryPath} -> {manifestPath}");
        }
    }

    private void InstallStartMenuShortcuts()
    {
        Directory.CreateDirectory(startMenuFolder);
        CreateStartMenuShortcut(
            startMenuAppShortcutPath,
            trayExecutablePath,
            "",
            options.InstallRoot,
            trayExecutablePath
        );
        CreateStartMenuShortcut(
            startMenuUninstallShortcutPath,
            setupExecutablePath,
            "uninstall",
            options.InstallRoot,
            trayExecutablePath
        );
        logger.Write("installed Start Menu shortcuts");
    }

    private static void CreateStartMenuShortcut(
        string shortcutPath,
        string targetPath,
        string arguments,
        string workingDirectory,
        string iconPath
    )
    {
        Directory.CreateDirectory(
            Path.GetDirectoryName(shortcutPath)
                ?? throw new InvalidOperationException(
                    "The Start Menu shortcut path has no parent directory."
                )
        );
        IShellLinkW? shellLink = null;
        try
        {
            shellLink = (IShellLinkW)(object)new ShellLink();
            shellLink.SetPath(targetPath);
            shellLink.SetArguments(arguments);
            shellLink.SetWorkingDirectory(workingDirectory);
            shellLink.SetDescription(ProductName);
            shellLink.SetIconLocation(iconPath, 0);
            ((IPersistFile)shellLink).Save(shortcutPath, true);
        }
        finally
        {
            if (shellLink is not null && Marshal.IsComObject(shellLink))
            {
                Marshal.FinalReleaseComObject(shellLink);
            }
        }
    }

    private void RegisterUninstallEntry(string version)
    {
        using var currentUser = RegistryKey.OpenBaseKey(
            RegistryHive.CurrentUser,
            RegistryView.Registry64
        );
        using var key = currentUser.CreateSubKey(UninstallRegistryPath, true)
            ?? throw new InvalidOperationException(
                "Could not create the YTM Tray uninstall registry entry."
            );
        key.SetValue("DisplayName", ProductName, RegistryValueKind.String);
        key.SetValue("DisplayVersion", version, RegistryValueKind.String);
        key.SetValue("Publisher", Publisher, RegistryValueKind.String);
        key.SetValue("InstallLocation", options.InstallRoot, RegistryValueKind.String);
        key.SetValue(
            "DisplayIcon",
            $"{trayExecutablePath},0",
            RegistryValueKind.String
        );
        key.SetValue(
            "UninstallString",
            $"\"{setupExecutablePath}\" uninstall",
            RegistryValueKind.String
        );
        key.SetValue(
            "QuietUninstallString",
            $"\"{setupExecutablePath}\" uninstall --quiet",
            RegistryValueKind.String
        );
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);

        var estimatedSize = InstalledFileNames
            .Select(fileName => Path.Combine(options.InstallRoot, fileName))
            .Where(File.Exists)
            .Sum(path => new FileInfo(path).Length);
        key.SetValue(
            "EstimatedSize",
            (int)Math.Min(int.MaxValue, Math.Max(1, estimatedSize / 1024)),
            RegistryValueKind.DWord
        );
        logger.Write("registered Windows uninstall entry");
    }

    private void RemoveStartMenuShortcuts()
    {
        DeleteFileWithRetry(startMenuAppShortcutPath);
        DeleteFileWithRetry(startMenuUninstallShortcutPath);
        RemoveDirectoryIfEmpty(startMenuFolder);
    }

    private void RemoveLegacyInstalledFiles()
    {
        foreach (var fileName in LegacyInstalledFileNames)
        {
            DeleteFileWithRetry(Path.Combine(options.InstallRoot, fileName));
        }
    }

    private void WaitForRequestedProcess()
    {
        if (options.WaitForProcessId is not int processId)
        {
            return;
        }

        Process process;
        try
        {
            process = Process.GetProcessById(processId);
        }
        catch (ArgumentException)
        {
            logger.Write($"process {processId} already exited");
            return;
        }

        using (process)
        {
            logger.Write($"waiting for process {processId} to exit");
            if (!process.WaitForExit((int)ProcessExitTimeout.TotalMilliseconds))
            {
                throw new TimeoutException(
                    $"Process {processId} did not exit within "
                        + $"{ProcessExitTimeout.TotalSeconds:0} seconds."
                );
            }
        }
    }

    private void StopRunningTrayProcesses()
    {
        foreach (
            var processName in new[] { "YTMTray", "YTMTray.NativeHost" }
        )
        {
            foreach (var process in Process.GetProcessesByName(processName))
            {
                using (process)
                {
                    try
                    {
                        if (process.HasExited)
                        {
                            continue;
                        }

                        logger.Write($"stopping {processName} process {process.Id}");
                        process.Kill(true);
                        if (
                            !process.WaitForExit(
                                (int)ProcessExitTimeout.TotalMilliseconds
                            )
                        )
                        {
                            throw new TimeoutException(
                                $"{processName} process {process.Id} did not exit."
                            );
                        }
                    }
                    catch (InvalidOperationException)
                    {
                        // The process exited between enumeration and inspection.
                    }
                }
            }
        }
    }

    private void CopyFileWithRetry(string sourcePath, string destinationPath)
    {
        if (PathsEqual(sourcePath, destinationPath))
        {
            return;
        }

        Directory.CreateDirectory(
            Path.GetDirectoryName(destinationPath)
                ?? throw new InvalidOperationException(
                    $"Destination has no parent directory: {destinationPath}"
                )
        );
        RetryFileOperation(
            () => File.Copy(sourcePath, destinationPath, true),
            $"copy {sourcePath} to {destinationPath}"
        );
    }

    private void WriteTextFileWithRetry(string path, string content)
    {
        RetryFileOperation(
            () => File.WriteAllText(path, content, Utf8WithoutBom),
            $"write {path}"
        );
    }

    private void DeleteFileWithRetry(string path)
    {
        if (!File.Exists(path))
        {
            return;
        }

        RetryFileOperation(() => File.Delete(path), $"delete {path}");
        logger.Write($"removed {path}");
    }

    private void RetryFileOperation(Action operation, string description)
    {
        var deadline = DateTime.UtcNow.AddSeconds(30);
        Exception? lastError = null;
        do
        {
            try
            {
                operation();
                return;
            }
            catch (Exception error)
                when (error is IOException or UnauthorizedAccessException)
            {
                lastError = error;
                Thread.Sleep(300);
            }
        } while (DateTime.UtcNow < deadline);

        throw new IOException($"Could not {description}.", lastError);
    }

    private static bool PathsEqual(string first, string second) =>
        string.Equals(
            Path.GetFullPath(first),
            Path.GetFullPath(second),
            StringComparison.OrdinalIgnoreCase
        );

    private static void DeleteRegistryTree(string registryPath)
    {
        using var currentUser = RegistryKey.OpenBaseKey(
            RegistryHive.CurrentUser,
            RegistryView.Registry64
        );
        currentUser.DeleteSubKeyTree(registryPath, false);
    }

    private void RemoveDirectoryIfEmpty(string path)
    {
        if (!Directory.Exists(path) || Directory.EnumerateFileSystemEntries(path).Any())
        {
            return;
        }

        Directory.Delete(path);
        logger.Write($"removed {path}");
    }

    private void RemoveDefaultInstallParentIfEmpty()
    {
        var defaultParent = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "YTM Enhancer"
        );
        var defaultRoot = Path.Combine(defaultParent, "Tray");
        if (PathsEqual(options.InstallRoot, defaultRoot))
        {
            RemoveDirectoryIfEmpty(defaultParent);
        }
    }

    private void ReapStaleWorkers()
    {
        if (!Directory.Exists(workerRoot))
        {
            return;
        }

        var currentDirectory = Path.TrimEndingDirectorySeparator(
            AppContext.BaseDirectory
        );
        foreach (var directory in Directory.EnumerateDirectories(workerRoot))
        {
            if (
                PathsEqual(directory, currentDirectory)
                || DateTime.UtcNow - Directory.GetLastWriteTimeUtc(directory)
                    < WorkerMaximumAge
            )
            {
                continue;
            }

            try
            {
                Directory.Delete(directory, true);
                logger.Write($"removed stale setup worker {directory}");
            }
            catch (Exception error)
                when (error is IOException or UnauthorizedAccessException)
            {
                logger.Write(
                    $"could not remove stale setup worker {directory}: {error.Message}"
                );
            }
        }

        try
        {
            if (!Directory.EnumerateFileSystemEntries(workerRoot).Any())
            {
                Directory.Delete(workerRoot);
            }
        }
        catch (Exception error)
            when (error is IOException or UnauthorizedAccessException)
        {
            logger.Write($"could not remove setup worker root: {error.Message}");
        }
    }

    private void ScheduleCurrentWorkerCleanup()
    {
        var currentExecutable = CurrentExecutablePath();
        var currentDirectory = Path.GetDirectoryName(currentExecutable);
        if (
            string.IsNullOrWhiteSpace(currentDirectory)
            || !IsPathWithin(currentDirectory, workerRoot)
        )
        {
            return;
        }

        var cleanupMarker = Path.Combine(currentDirectory, ".cleanup-pending");
        try
        {
            File.WriteAllText(
                cleanupMarker,
                DateTimeOffset.UtcNow.ToString("O"),
                Utf8WithoutBom
            );
        }
        catch (Exception error)
            when (error is IOException or UnauthorizedAccessException)
        {
            logger.Write($"could not write worker cleanup marker: {error.Message}");
        }

        ScheduleDeleteAtRestart(currentExecutable);
        if (File.Exists(cleanupMarker))
        {
            ScheduleDeleteAtRestart(cleanupMarker);
        }

        ScheduleDeleteAtRestart(currentDirectory);
    }

    private void ScheduleDeleteAtRestart(string path)
    {
        if (
            !NativeMethods.MoveFileEx(
                path,
                null,
                NativeMethods.MoveFileFlags.DelayUntilReboot
            )
        )
        {
            logger.Write(
                $"could not schedule cleanup for {path}; a future setup run will retry"
            );
        }
    }

    private static string CurrentExecutablePath() =>
        Environment.ProcessPath
        ?? throw new InvalidOperationException(
            "Could not determine the current setup executable path."
        );

    private static bool IsPathWithin(string path, string parent)
    {
        var normalizedPath =
            Path.TrimEndingDirectorySeparator(Path.GetFullPath(path))
            + Path.DirectorySeparatorChar;
        var normalizedParent =
            Path.TrimEndingDirectorySeparator(Path.GetFullPath(parent))
            + Path.DirectorySeparatorChar;
        return normalizedPath.StartsWith(
            normalizedParent,
            StringComparison.OrdinalIgnoreCase
        );
    }

    private static IEnumerable<string> AllManagedInstalledFileNames() =>
        InstalledFileNames
            .Concat(LegacyInstalledFileNames)
            .Concat(RuntimeStateFileNames);

    private sealed record PackagedPayload(
        string TrayExecutablePath,
        string NativeHostExecutablePath,
        string SetupExecutablePath,
        string ReleaseMetadataPath,
        string Version
    );
}

internal sealed class InstallBackup : IDisposable
{
    private readonly string installRoot;
    private readonly string backupRoot;
    private readonly IReadOnlyList<FileSnapshot> installedFiles;
    private readonly IReadOnlyList<FileSnapshot> shortcutFiles;
    private readonly IReadOnlyList<RegistrySnapshot> registrySnapshots;
    private readonly SetupLogger logger;
    private readonly bool installRootExisted;
    private bool committed;
    private bool restored;

    private InstallBackup(
        string installRoot,
        string backupRoot,
        IReadOnlyList<FileSnapshot> installedFiles,
        IReadOnlyList<FileSnapshot> shortcutFiles,
        IReadOnlyList<RegistrySnapshot> registrySnapshots,
        SetupLogger logger,
        bool installRootExisted
    )
    {
        this.installRoot = installRoot;
        this.backupRoot = backupRoot;
        this.installedFiles = installedFiles;
        this.shortcutFiles = shortcutFiles;
        this.registrySnapshots = registrySnapshots;
        this.logger = logger;
        this.installRootExisted = installRootExisted;
    }

    public static InstallBackup Capture(
        string installRoot,
        IEnumerable<string> installedFileNames,
        IEnumerable<string> shortcutPaths,
        IEnumerable<string> registryPaths,
        SetupLogger logger
    )
    {
        var backupRoot = Path.Combine(
            Path.GetTempPath(),
            $"ytm-tray-install-backup-{Guid.NewGuid():N}"
        );
        Directory.CreateDirectory(backupRoot);
        try
        {
            var installedFiles = installedFileNames
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Select((fileName, index) =>
                    FileSnapshot.Capture(
                        Path.Combine(installRoot, fileName),
                        Path.Combine(backupRoot, $"installed-{index}")
                    )
                )
                .ToArray();
            var shortcutFiles = shortcutPaths
                .Select((path, index) =>
                    FileSnapshot.Capture(
                        path,
                        Path.Combine(backupRoot, $"shortcut-{index}")
                    )
                )
                .ToArray();
            var registrySnapshots = registryPaths
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(RegistrySnapshot.Capture)
                .ToArray();
            return new InstallBackup(
                installRoot,
                backupRoot,
                installedFiles,
                shortcutFiles,
                registrySnapshots,
                logger,
                Directory.Exists(installRoot)
            );
        }
        catch
        {
            Directory.Delete(backupRoot, true);
            throw;
        }
    }

    public void Commit()
    {
        committed = true;
    }

    public void Restore()
    {
        if (restored)
        {
            return;
        }

        var restoreErrors = new List<Exception>();
        foreach (var snapshot in installedFiles.Concat(shortcutFiles))
        {
            try
            {
                snapshot.Restore();
            }
            catch (Exception error)
            {
                restoreErrors.Add(error);
                logger.Write($"file rollback failed: {error}");
            }
        }

        foreach (var snapshot in registrySnapshots)
        {
            try
            {
                snapshot.Restore();
            }
            catch (Exception error)
            {
                restoreErrors.Add(error);
                logger.Write($"registry rollback failed: {error}");
            }
        }

        if (
            !installRootExisted
            && Directory.Exists(installRoot)
            && !Directory.EnumerateFileSystemEntries(installRoot).Any()
        )
        {
            Directory.Delete(installRoot);
        }

        restored = true;
        if (restoreErrors.Count > 0)
        {
            throw new AggregateException(
                "YTM Tray installation failed and rollback was incomplete.",
                restoreErrors
            );
        }
    }

    public void Dispose()
    {
        if (!committed && !restored)
        {
            Restore();
        }

        try
        {
            Directory.Delete(backupRoot, true);
        }
        catch (Exception error)
            when (error is IOException or UnauthorizedAccessException)
        {
            logger.Write($"could not remove install backup {backupRoot}: {error.Message}");
        }
    }
}

internal sealed record FileSnapshot(string Path, string BackupPath, bool Existed)
{
    public static FileSnapshot Capture(string path, string backupPath)
    {
        var existed = File.Exists(path);
        if (existed)
        {
            File.Copy(path, backupPath, true);
        }

        return new FileSnapshot(path, backupPath, existed);
    }

    public void Restore()
    {
        if (Existed)
        {
            Directory.CreateDirectory(
                System.IO.Path.GetDirectoryName(Path)
                    ?? throw new InvalidOperationException(
                        $"Backup target has no parent directory: {Path}"
                    )
            );
            File.Copy(BackupPath, Path, true);
        }
        else if (File.Exists(Path))
        {
            File.Delete(Path);
        }
    }
}

internal sealed record RegistryValueSnapshot(
    string Name,
    object Value,
    RegistryValueKind Kind
);

internal sealed record RegistrySnapshot(
    string Path,
    bool Existed,
    IReadOnlyList<RegistryValueSnapshot> Values
)
{
    public static RegistrySnapshot Capture(string path)
    {
        using var currentUser = RegistryKey.OpenBaseKey(
            RegistryHive.CurrentUser,
            RegistryView.Registry64
        );
        using var key = currentUser.OpenSubKey(path);
        if (key is null)
        {
            return new RegistrySnapshot(path, false, []);
        }

        var values = key
            .GetValueNames()
            .Select(name =>
                new RegistryValueSnapshot(
                    name,
                    CloneRegistryValue(
                        key.GetValue(name, null, RegistryValueOptions.DoNotExpandEnvironmentNames)
                            ?? ""
                    ),
                    key.GetValueKind(name)
                )
            )
            .ToArray();
        return new RegistrySnapshot(path, true, values);
    }

    public void Restore()
    {
        using var currentUser = RegistryKey.OpenBaseKey(
            RegistryHive.CurrentUser,
            RegistryView.Registry64
        );
        currentUser.DeleteSubKeyTree(Path, false);
        if (!Existed)
        {
            return;
        }

        using var key = currentUser.CreateSubKey(Path, true)
            ?? throw new InvalidOperationException(
                $"Could not restore registry key HKCU\\{Path}."
            );
        foreach (var value in Values)
        {
            key.SetValue(value.Name, value.Value, value.Kind);
        }
    }

    private static object CloneRegistryValue(object value) =>
        value switch
        {
            byte[] bytes => bytes.ToArray(),
            string[] strings => strings.ToArray(),
            _ => value
        };
}

[ComImport]
[Guid("00021401-0000-0000-C000-000000000046")]
internal sealed class ShellLink;

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("000214F9-0000-0000-C000-000000000046")]
internal interface IShellLinkW
{
    void GetPath(
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder file,
        int maximumPath,
        IntPtr findData,
        uint flags
    );

    void GetIdList(out IntPtr itemIdList);

    void SetIdList(IntPtr itemIdList);

    void GetDescription(
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder name,
        int maximumName
    );

    void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string name);

    void GetWorkingDirectory(
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder directory,
        int maximumPath
    );

    void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string directory);

    void GetArguments(
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder arguments,
        int maximumPath
    );

    void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string arguments);

    void GetHotkey(out short hotkey);

    void SetHotkey(short hotkey);

    void GetShowCommand(out int showCommand);

    void SetShowCommand(int showCommand);

    void GetIconLocation(
        [Out, MarshalAs(UnmanagedType.LPWStr)] StringBuilder iconPath,
        int iconPathLength,
        out int iconIndex
    );

    void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string iconPath, int iconIndex);

    void SetRelativePath(
        [MarshalAs(UnmanagedType.LPWStr)] string relativePath,
        uint reserved
    );

    void Resolve(IntPtr windowHandle, uint flags);

    void SetPath([MarshalAs(UnmanagedType.LPWStr)] string file);
}

internal static class NativeMethods
{
    [Flags]
    internal enum MoveFileFlags : uint
    {
        DelayUntilReboot = 0x4
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    internal static extern bool MoveFileEx(
        string existingFileName,
        string? newFileName,
        MoveFileFlags flags
    );
}
