using System.IO.Compression;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using YTMTray.Core;

var tests = new (string Name, Func<Task> Run)[]
{
    ("protocol manifest uses tray connector identity", ProtocolManifest),
    ("native messaging codec round trips JSON frames", NativeMessagingCodecRoundTrip),
    ("connector app handshakes and subscribes after ready", ConnectorAppHandshake),
    ("connector app updates tray playback state", ConnectorAppPlaybackState),
    ("update service finds newest tray release", UpdateServiceFindsNewestTrayRelease),
    ("update service ignores current tray release", UpdateServiceIgnoresCurrentTrayRelease),
    ("update service prepares verified package", UpdateServicePreparesVerifiedPackage),
    ("update service rejects unsafe package entries", UpdateServiceRejectsUnsafePackageEntries)
};

var failures = new List<string>();
foreach (var test in tests)
{
    try
    {
        await test.Run();
        Console.WriteLine($"ok {test.Name}");
    }
    catch (Exception error)
    {
        failures.Add($"{test.Name}: {error.Message}");
        Console.Error.WriteLine($"not ok {test.Name}: {error}");
    }
}

if (failures.Count > 0)
{
    Console.Error.WriteLine($"{failures.Count} test(s) failed");
    Environment.Exit(1);
}

static Task ProtocolManifest()
{
    var hello = ConnectorProtocol.Hello("hello-1");

    AssertEqual("connector.hello", hello.Type);
    AssertEqual("com.gormanity.ytm-enhancer.tray", hello.Manifest.Id);
    AssertEqual("YTM Tray", hello.Manifest.Name);
    AssertEqual("1.0.0", hello.Manifest.ProtocolVersion);
    AssertContains("playback:read", hello.Manifest.Permissions);
    AssertContains("playback:control", hello.Manifest.Permissions);
    AssertContains("track:read", hello.Manifest.Permissions);
    AssertContains("ytm:focus", hello.Manifest.Permissions);

    return Task.CompletedTask;
}

static async Task NativeMessagingCodecRoundTrip()
{
    await using var stream = new MemoryStream();
    await NativeMessagingCodec.WriteMessageAsync(
        stream,
        ConnectorProtocol.PlaybackAction("togglePlay", "action-1")
    );
    stream.Position = 0;

    using var document = await NativeMessagingCodec.ReadJsonAsync(stream);
    AssertNotNull(document, "framed message");
    AssertEqual("playback.action", document!.RootElement.GetProperty("type").GetString());
    AssertEqual("action-1", document.RootElement.GetProperty("requestId").GetString());
    AssertEqual("togglePlay", document.RootElement.GetProperty("action").GetString());
}

static async Task ConnectorAppHandshake()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);

    app.Start();
    AssertEqual("connector.hello", connection.MessageTypeAt(0));

    connection.Emit(new HostMessage
    {
        Type = "connector.ready",
        RequestId = "hello-1"
    });

    AssertEqual("Connected", tray.Status);
    AssertEqual("connector.subscribe", connection.MessageTypeAt(1));
    AssertEqual("playback.getState", connection.MessageTypeAt(2));
    await Task.CompletedTask;
}

static Task ConnectorAppPlaybackState()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    var state = new PlaybackState(
        "Song",
        "Artist",
        "Album",
        2026,
        null,
        null,
        true,
        12,
        60,
        false,
        "off"
    );
    connection.Emit(new HostMessage { Type = "playback.state", State = state });

    AssertEqual("Song", tray.State?.Title);
    AssertEqual(true, tray.State?.IsPlaying);
    return Task.CompletedTask;
}

static async Task UpdateServiceFindsNewestTrayRelease()
{
    const string releaseListUrl = "https://example.test/releases";
    const string manifestUrl =
        "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json";
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri == releaseListUrl
            ? JsonResponse(
                """
                [
                  {
                    "tag_name": "windows-tray-v0.1.1",
                    "html_url": "https://example.test/releases/windows-tray-v0.1.1",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                      {
                        "name": "YTM-Tray-update.json",
                        "browser_download_url": "https://example.test/download/windows-tray-v0.1.1/YTM-Tray-update.json"
                      }
                    ]
                  },
                  {
                    "tag_name": "v9.9.9",
                    "html_url": "https://example.test/releases/v9.9.9",
                    "draft": false,
                    "prerelease": false,
                    "assets": []
                  },
                  {
                    "tag_name": "windows-tray-v0.2.0",
                    "html_url": "https://example.test/releases/windows-tray-v0.2.0",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                      {
                        "name": "YTM-Tray-update.json",
                        "browser_download_url": "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json"
                      }
                    ]
                  }
                ]
                """
            )
            : new HttpResponseMessage(HttpStatusCode.NotFound)
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri(releaseListUrl),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();

    AssertEqual(true, update.IsUpdateAvailable);
    AssertEqual("0.2.0", update.LatestVersion);
    AssertEqual(manifestUrl, update.ManifestUrl?.AbsoluteUri);
}

static async Task UpdateServiceIgnoresCurrentTrayRelease()
{
    const string releaseListUrl = "https://example.test/releases";
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri == releaseListUrl
            ? JsonResponse(
                """
                [
                  {
                    "tag_name": "windows-tray-v0.1.0",
                    "html_url": "https://example.test/releases/windows-tray-v0.1.0",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                      {
                        "name": "YTM-Tray-update.json",
                        "browser_download_url": "https://example.test/download/windows-tray-v0.1.0/YTM-Tray-update.json"
                      }
                    ]
                  }
                ]
                """
            )
            : new HttpResponseMessage(HttpStatusCode.NotFound)
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri(releaseListUrl),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();

    AssertEqual(false, update.IsUpdateAvailable);
    AssertEqual("0.1.0", update.LatestVersion);
}

static async Task UpdateServicePreparesVerifiedPackage()
{
    using var temp = new TempDirectory();
    var packageBytes = CreatePackageBytes(
        ("install-native-hosts.ps1", "Write-Output installed"),
        ("YTMTray.exe", "tray"),
        ("YTMTray.NativeHost.exe", "native-host")
    );
    var checksum = Sha256(packageBytes);
    var manifest = UpdateManifestJson(checksum);
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri switch
        {
            "https://example.test/releases" => ReleasesResponse(),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json" =>
                JsonResponse(manifest),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip" =>
                BytesResponse(packageBytes),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        }
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri("https://example.test/releases"),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();
    var prepared = await service.DownloadAndPrepareUpdateAsync(update, temp.Path);

    AssertEqual("0.2.0", prepared.Version);
    AssertEqual(true, File.Exists(prepared.PackagePath));
    AssertEqual(true, File.Exists(prepared.InstallerScriptPath));
}

static async Task UpdateServiceRejectsUnsafePackageEntries()
{
    using var temp = new TempDirectory();
    var packageBytes = CreatePackageBytes(
        ("install-native-hosts.ps1", "Write-Output installed"),
        ("../escape.txt", "unsafe")
    );
    var checksum = Sha256(packageBytes);
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri switch
        {
            "https://example.test/releases" => ReleasesResponse(),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json" =>
                JsonResponse(UpdateManifestJson(checksum)),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip" =>
                BytesResponse(packageBytes),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        }
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri("https://example.test/releases"),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();
    await AssertThrowsAsync<InvalidDataException>(
        () => service.DownloadAndPrepareUpdateAsync(update, temp.Path),
        "unsafe package path"
    );
}

static HttpResponseMessage ReleasesResponse() =>
    JsonResponse(
        """
        [
          {
            "tag_name": "windows-tray-v0.2.0",
            "html_url": "https://example.test/releases/windows-tray-v0.2.0",
            "draft": false,
            "prerelease": false,
            "assets": [
              {
                "name": "YTM-Tray-update.json",
                "browser_download_url": "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json"
              }
            ]
          }
        ]
        """
    );

static string UpdateManifestJson(string checksum) =>
    $$"""
    {
      "schemaVersion": 1,
      "product": "windows-tray",
      "name": "YTM Tray",
      "version": "0.2.0",
      "buildNumber": 2000,
      "tag": "windows-tray-v0.2.0",
      "releaseUrl": "https://example.test/releases/windows-tray-v0.2.0",
      "installUrl": "https://example.test/releases?q=windows-tray-v&expanded=true",
      "releaseListUrl": "https://example.test/releases",
      "minimumWindowsVersion": "Windows 11",
      "assets": {
        "win-x64": {
          "name": "YTM-Tray-0.2.0-win-x64.zip",
          "sha256": "{{checksum}}",
          "size": 0,
          "url": "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip"
        }
      }
    }
    """;

static byte[] CreatePackageBytes(params (string Name, string Content)[] entries)
{
    using var stream = new MemoryStream();
    using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
    {
        foreach (var entry in entries)
        {
            var archiveEntry = archive.CreateEntry(entry.Name);
            using var writer = new StreamWriter(archiveEntry.Open(), Encoding.UTF8);
            writer.Write(entry.Content);
        }
    }

    return stream.ToArray();
}

static string Sha256(byte[] bytes) =>
    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

static HttpResponseMessage JsonResponse(string json) =>
    new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

static HttpResponseMessage BytesResponse(byte[] bytes) =>
    new(HttpStatusCode.OK)
    {
        Content = new ByteArrayContent(bytes)
    };

static void AssertEqual<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new InvalidOperationException($"expected {expected}, got {actual}");
    }
}

static void AssertContains<T>(T expected, IEnumerable<T> values)
{
    if (!values.Contains(expected))
    {
        throw new InvalidOperationException($"expected collection to contain {expected}");
    }
}

static void AssertNotNull(object? value, string label)
{
    if (value is null)
    {
        throw new InvalidOperationException($"{label} was null");
    }
}

static async Task AssertThrowsAsync<T>(Func<Task> action, string expectedMessage)
    where T : Exception
{
    try
    {
        await action();
    }
    catch (T error) when (error.Message.Contains(expectedMessage, StringComparison.OrdinalIgnoreCase))
    {
        return;
    }

    throw new InvalidOperationException($"expected {typeof(T).Name} containing {expectedMessage}");
}

sealed class FakeConnection : IConnectorConnection
{
    private Action<HostMessage>? onMessage;
    public List<object> SentMessages { get; } = [];

    public void Start(Action<HostMessage> onMessage, Action onDisconnect)
    {
        this.onMessage = onMessage;
    }

    public Task SendAsync(object message, CancellationToken cancellationToken = default)
    {
        SentMessages.Add(message);
        return Task.CompletedTask;
    }

    public void Emit(HostMessage message) => onMessage?.Invoke(message);

    public string MessageTypeAt(int index)
    {
        var json = JsonSerializer.SerializeToElement(
            SentMessages[index],
            JsonSettings.Options
        );
        return json.GetProperty("type").GetString() ?? "";
    }

    public void Stop() { }
    public void Dispose() { }
}

sealed class FakeTrayController : ITrayController
{
    public Action? OnShuffle { get; set; }
    public Action? OnPrevious { get; set; }
    public Action? OnTogglePlay { get; set; }
    public Action? OnNext { get; set; }
    public Action? OnRepeat { get; set; }
    public Action<double>? OnSeek { get; set; }
    public Action? OnFocusYouTubeMusic { get; set; }
    public string? Status { get; private set; }
    public PlaybackState? State { get; private set; }

    public void UpdateConnectionStatus(string status) => Status = status;
    public void SetStalePlaybackState() => Status = "Waiting for playback updates...";
    public void UpdatePlayback(PlaybackState state) => State = state;
}

sealed class FakeHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken
    ) => Task.FromResult(respond(request));
}

sealed class TempDirectory : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(
        System.IO.Path.GetTempPath(),
        $"ytm-tray-test-{Guid.NewGuid():N}"
    );

    public TempDirectory()
    {
        Directory.CreateDirectory(Path);
    }

    public void Dispose()
    {
        Directory.Delete(Path, recursive: true);
    }
}
