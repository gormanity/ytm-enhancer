using System.Diagnostics;
using System.IO.Compression;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace YTMTray.Core;

public sealed record WindowsTrayUpdateOptions(
    Uri ReleaseListUrl,
    string TagPrefix,
    string CurrentVersion,
    string RuntimeIdentifier
)
{
    public string ManifestAssetName { get; init; } = "YTM-Tray-update.json";
    public string Product { get; init; } = "windows-tray";

    public static WindowsTrayUpdateOptions Default =>
        FromReleaseMetadataFile(AppContext.BaseDirectory) ?? BuiltInDefault;

    public static WindowsTrayUpdateOptions BuiltInDefault =>
        new(
            new Uri("https://api.github.com/repos/gormanity/ytm-enhancer/releases"),
            "windows-tray-v",
            ConnectorProtocol.ConnectorVersion,
            CurrentRuntimeIdentifier()
        );

    public static WindowsTrayUpdateOptions? FromReleaseMetadataFile(string directory)
    {
        var releaseMetadataPath = Path.Combine(directory, "release.json");
        if (!File.Exists(releaseMetadataPath)) return null;

        try
        {
            var metadata = JsonSerializer.Deserialize<PackagedReleaseMetadata>(
                File.ReadAllText(releaseMetadataPath),
                JsonSettings.Options
            );
            if (metadata?.ReleaseListUrl is null || metadata.GithubReleaseTagPrefix is null)
            {
                return null;
            }

            return new WindowsTrayUpdateOptions(
                metadata.ReleaseListUrl,
                metadata.GithubReleaseTagPrefix,
                ConnectorProtocol.ConnectorVersion,
                string.IsNullOrWhiteSpace(metadata.RuntimeIdentifier)
                    ? CurrentRuntimeIdentifier()
                    : metadata.RuntimeIdentifier
            )
            {
                ManifestAssetName = string.IsNullOrWhiteSpace(metadata.UpdateManifestAssetName)
                    ? "YTM-Tray-update.json"
                    : metadata.UpdateManifestAssetName
            };
        }
        catch (Exception error)
            when (error
                is IOException
                    or JsonException
                    or NotSupportedException
                    or UnauthorizedAccessException)
        {
            return null;
        }
    }

    public static string CurrentRuntimeIdentifier() =>
        RuntimeInformation.ProcessArchitecture == Architecture.Arm64
            ? "win-arm64"
            : "win-x64";
}

public sealed record WindowsTrayUpdateCheckResult(
    bool IsUpdateAvailable,
    string CurrentVersion,
    string? LatestVersion,
    string? Tag,
    Uri? ReleaseUrl,
    Uri? ManifestUrl
);

public sealed record PreparedWindowsTrayUpdate(
    string Version,
    string RuntimeIdentifier,
    string PackagePath,
    string ExtractDirectory,
    string InstallerScriptPath
);

public sealed class WindowsTrayUpdateService
{
    private readonly HttpClient httpClient;
    private readonly WindowsTrayUpdateOptions options;

    public WindowsTrayUpdateService(HttpClient httpClient, WindowsTrayUpdateOptions options)
    {
        this.httpClient = httpClient;
        this.options = options;
        EnsureUserAgent(httpClient.DefaultRequestHeaders.UserAgent);
    }

    public static WindowsTrayUpdateService CreateDefault() =>
        new(new HttpClient(), WindowsTrayUpdateOptions.Default);

    public async Task<WindowsTrayUpdateCheckResult> CheckForUpdateAsync(
        CancellationToken cancellationToken = default
    )
    {
        RequireHttps(options.ReleaseListUrl, "release list");

        using var response = await httpClient.GetAsync(options.ReleaseListUrl, cancellationToken);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        var releases =
            JsonSerializer.Deserialize<List<GitHubRelease>>(json, JsonSettings.Options) ?? [];

        var latest = releases
            .Where(release => !release.Draft && !release.Prerelease)
            .Select(ToCandidate)
            .Where(candidate => candidate is not null)
            .Cast<UpdateCandidate>()
            .OrderByDescending(candidate => ParseVersion(candidate.Version))
            .FirstOrDefault();

        if (latest is null)
        {
            return new WindowsTrayUpdateCheckResult(
                false,
                options.CurrentVersion,
                null,
                null,
                null,
                null
            );
        }

        var hasUpdate =
            CompareVersions(latest.Version, options.CurrentVersion) > 0;
        return new WindowsTrayUpdateCheckResult(
            hasUpdate,
            options.CurrentVersion,
            latest.Version,
            latest.Tag,
            latest.ReleaseUrl,
            latest.ManifestUrl
        );
    }

    public async Task<PreparedWindowsTrayUpdate> DownloadAndPrepareUpdateAsync(
        WindowsTrayUpdateCheckResult update,
        string? downloadRoot = null,
        CancellationToken cancellationToken = default
    )
    {
        if (!update.IsUpdateAvailable || update.ManifestUrl is null)
        {
            throw new InvalidOperationException("No Windows tray update is available.");
        }

        RequireHttps(update.ManifestUrl, "update manifest");

        var updateRoot = Path.Combine(
            downloadRoot ?? DefaultDownloadRoot(),
            $"{update.Tag ?? "windows-tray-update"}-{Guid.NewGuid():N}"
        );
        Directory.CreateDirectory(updateRoot);

        var manifest = await DownloadManifestAsync(update.ManifestUrl, cancellationToken);
        ValidateManifest(manifest, update);

        if (!manifest.Assets.TryGetValue(options.RuntimeIdentifier, out var asset))
        {
            throw new InvalidOperationException(
                $"No Windows tray update package is available for {options.RuntimeIdentifier}."
            );
        }

        RequireHttps(asset.Url, "update package");

        var packagePath = Path.Combine(updateRoot, asset.Name);
        await DownloadFileAsync(asset.Url, packagePath, cancellationToken);
        VerifyChecksum(packagePath, asset.Sha256);

        var extractDirectory = Path.Combine(updateRoot, "payload");
        ExtractZipSafely(packagePath, extractDirectory);

        var installerScriptPath = Path.Combine(extractDirectory, "install-native-hosts.ps1");
        if (!File.Exists(installerScriptPath))
        {
            throw new InvalidDataException("Update package is missing install-native-hosts.ps1.");
        }

        return new PreparedWindowsTrayUpdate(
            manifest.Version,
            options.RuntimeIdentifier,
            packagePath,
            extractDirectory,
            installerScriptPath
        );
    }

    public Process StartInstaller(PreparedWindowsTrayUpdate update)
    {
        if (!File.Exists(update.InstallerScriptPath))
        {
            throw new FileNotFoundException(
                "Update installer script was not found.",
                update.InstallerScriptPath
            );
        }

        var startInfo = new ProcessStartInfo("powershell.exe")
        {
            WorkingDirectory = update.ExtractDirectory,
            UseShellExecute = false
        };
        startInfo.ArgumentList.Add("-NoLogo");
        startInfo.ArgumentList.Add("-NoProfile");
        startInfo.ArgumentList.Add("-ExecutionPolicy");
        startInfo.ArgumentList.Add("Bypass");
        startInfo.ArgumentList.Add("-File");
        startInfo.ArgumentList.Add(update.InstallerScriptPath);
        startInfo.ArgumentList.Add("-RuntimeIdentifier");
        startInfo.ArgumentList.Add(update.RuntimeIdentifier);

        return Process.Start(startInfo)
            ?? throw new InvalidOperationException("Failed to start the Windows tray installer.");
    }

    private UpdateCandidate? ToCandidate(GitHubRelease release)
    {
        if (!release.TagName.StartsWith(options.TagPrefix, StringComparison.Ordinal))
        {
            return null;
        }

        var version = release.TagName[options.TagPrefix.Length..];
        var manifestAsset = release.Assets.FirstOrDefault(asset =>
            string.Equals(asset.Name, options.ManifestAssetName, StringComparison.Ordinal)
        );
        if (
            manifestAsset?.BrowserDownloadUrl is null
            || !Uri.TryCreate(manifestAsset.BrowserDownloadUrl, UriKind.Absolute, out var manifestUrl)
            || !Uri.TryCreate(release.HtmlUrl, UriKind.Absolute, out var releaseUrl)
        )
        {
            return null;
        }

        return new UpdateCandidate(version, release.TagName, releaseUrl, manifestUrl);
    }

    private async Task<WindowsTrayUpdateManifest> DownloadManifestAsync(
        Uri manifestUrl,
        CancellationToken cancellationToken
    )
    {
        using var response = await httpClient.GetAsync(manifestUrl, cancellationToken);
        response.EnsureSuccessStatusCode();
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        return JsonSerializer.Deserialize<WindowsTrayUpdateManifest>(json, JsonSettings.Options)
            ?? throw new InvalidDataException("Update manifest is invalid JSON.");
    }

    private async Task DownloadFileAsync(
        Uri url,
        string path,
        CancellationToken cancellationToken
    )
    {
        using var response = await httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        await using var source = await response.Content.ReadAsStreamAsync(cancellationToken);
        await using var target = File.Create(path);
        await source.CopyToAsync(target, cancellationToken);
    }

    private void ValidateManifest(
        WindowsTrayUpdateManifest manifest,
        WindowsTrayUpdateCheckResult update
    )
    {
        if (!string.Equals(manifest.Product, options.Product, StringComparison.Ordinal))
        {
            throw new InvalidDataException("Update manifest is for a different product.");
        }

        if (!string.Equals(manifest.Tag, update.Tag, StringComparison.Ordinal))
        {
            throw new InvalidDataException("Update manifest tag does not match the release.");
        }

        if (!string.Equals(manifest.Version, update.LatestVersion, StringComparison.Ordinal))
        {
            throw new InvalidDataException("Update manifest version does not match the release.");
        }
    }

    private static void ExtractZipSafely(string archivePath, string destinationDirectory)
    {
        var destinationRoot = Path.GetFullPath(destinationDirectory);
        Directory.CreateDirectory(destinationRoot);

        using var archive = ZipFile.OpenRead(archivePath);
        foreach (var entry in archive.Entries)
        {
            var targetPath = Path.GetFullPath(Path.Combine(destinationRoot, entry.FullName));
            if (!IsInsideDirectory(destinationRoot, targetPath))
            {
                throw new InvalidDataException("Update package contains an unsafe package path.");
            }

            if (string.IsNullOrEmpty(entry.Name))
            {
                Directory.CreateDirectory(targetPath);
                continue;
            }

            var targetDirectory = Path.GetDirectoryName(targetPath);
            if (targetDirectory is null)
            {
                throw new InvalidDataException("Update package contains an unsafe package path.");
            }

            Directory.CreateDirectory(targetDirectory);
            entry.ExtractToFile(targetPath, overwrite: false);
        }
    }

    private static bool IsInsideDirectory(string directory, string path)
    {
        var normalizedDirectory = directory.EndsWith(Path.DirectorySeparatorChar)
            ? directory
            : $"{directory}{Path.DirectorySeparatorChar}";
        return path.StartsWith(normalizedDirectory, PathComparison);
    }

    private static void VerifyChecksum(string path, string expectedSha256)
    {
        var actualSha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path)))
            .ToLowerInvariant();
        if (!string.Equals(actualSha256, expectedSha256, StringComparison.OrdinalIgnoreCase))
        {
            File.Delete(path);
            throw new InvalidDataException("Update package checksum did not match the manifest.");
        }
    }

    private static void RequireHttps(Uri uri, string label)
    {
        if (uri.Scheme != Uri.UriSchemeHttps)
        {
            throw new InvalidOperationException($"Windows tray {label} URL must use HTTPS.");
        }
    }

    private static void EnsureUserAgent(HttpHeaderValueCollection<ProductInfoHeaderValue> userAgent)
    {
        if (userAgent.Count > 0) return;
        userAgent.ParseAdd("YTM-Tray-Updater");
    }

    private static string DefaultDownloadRoot() =>
        Path.Combine(Path.GetTempPath(), "YTM Enhancer", "Tray", "Updates");

    private static int CompareVersions(string left, string right) =>
        ParseVersion(left).CompareTo(ParseVersion(right));

    private static Version ParseVersion(string value)
    {
        if (Version.TryParse(value, out var parsed))
        {
            return new Version(
                parsed.Major,
                Math.Max(0, parsed.Minor),
                Math.Max(0, parsed.Build),
                Math.Max(0, parsed.Revision)
            );
        }

        return new Version(0, 0, 0, 0);
    }

    private static StringComparison PathComparison =>
        OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
}

public sealed class WindowsTrayUpdateManifest
{
    public int SchemaVersion { get; init; }
    public string Product { get; init; } = "";
    public string Name { get; init; } = "";
    public string Version { get; init; } = "";
    public int BuildNumber { get; init; }
    public string Tag { get; init; } = "";
    public Uri ReleaseUrl { get; init; } = new("https://example.invalid");
    public Uri InstallUrl { get; init; } = new("https://example.invalid");
    public Uri ReleaseListUrl { get; init; } = new("https://example.invalid");
    public string MinimumWindowsVersion { get; init; } = "";
    public Dictionary<string, WindowsTrayUpdateAsset> Assets { get; init; } = [];
}

public sealed class WindowsTrayUpdateAsset
{
    public string Name { get; init; } = "";
    public string Sha256 { get; init; } = "";
    public long Size { get; init; }
    public Uri Url { get; init; } = new("https://example.invalid");
}

internal sealed record UpdateCandidate(
    string Version,
    string Tag,
    Uri ReleaseUrl,
    Uri ManifestUrl
);

internal sealed class GitHubRelease
{
    [JsonPropertyName("tag_name")]
    public string TagName { get; init; } = "";

    [JsonPropertyName("html_url")]
    public string HtmlUrl { get; init; } = "";

    public bool Draft { get; init; }
    public bool Prerelease { get; init; }
    public List<GitHubReleaseAsset> Assets { get; init; } = [];
}

internal sealed class GitHubReleaseAsset
{
    public string Name { get; init; } = "";

    [JsonPropertyName("browser_download_url")]
    public string? BrowserDownloadUrl { get; init; }
}

internal sealed class PackagedReleaseMetadata
{
    public Uri? ReleaseListUrl { get; init; }
    public string? GithubReleaseTagPrefix { get; init; }
    public string? RuntimeIdentifier { get; init; }
    public string? UpdateManifestAssetName { get; init; }
}
