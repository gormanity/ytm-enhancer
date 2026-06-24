using System.Text.Json;
using YTMTray.Core;

var tests = new (string Name, Func<Task> Run)[]
{
    ("protocol manifest uses tray connector identity", ProtocolManifest),
    ("native messaging codec round trips JSON frames", NativeMessagingCodecRoundTrip),
    ("connector app handshakes and subscribes after ready", ConnectorAppHandshake),
    ("connector app updates tray playback state", ConnectorAppPlaybackState)
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
