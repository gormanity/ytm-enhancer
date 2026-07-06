using System.Reflection;

namespace YTMTray.Core;

public static partial class ConnectorProtocol
{
    public const string HostName = "com.gormanity.ytm_enhancer.tray";
    public const string ConnectorId = "com.gormanity.ytm-enhancer.tray";
    public const string ConnectorName = "YTM Tray";
    public static string ConnectorVersion =>
        typeof(ConnectorProtocol)
            .Assembly
            .GetCustomAttribute<AssemblyInformationalVersionAttribute>()
            ?.InformationalVersion ?? "0.1.4";
    public const string ProtocolVersion = "1.0.0";
    public const string UninstallRequestedType = "connector.uninstallRequested";

    public static readonly string[] Permissions =
    [
        "playback:read",
        "playback:control",
        "track:read",
        "ytm:focus"
    ];

    public static ConnectorHelloMessage Hello(string requestId) =>
        new(
            "connector.hello",
            requestId,
            new ConnectorManifest(
                ConnectorId,
                ConnectorName,
                ConnectorVersion,
                ProtocolVersion,
                Permissions
            )
        );

    public static ConnectorSubscribeMessage SubscribePlayback(string requestId) =>
        new("connector.subscribe", requestId, ["playback.state"]);

    public static PlaybackGetStateMessage PlaybackStateRequest(string requestId) =>
        new("playback.getState", requestId);

    public static PlaybackActionMessage PlaybackAction(string action, string requestId) =>
        new("playback.action", requestId, action);

    public static PlaybackSeekMessage PlaybackSeek(double time, string requestId) =>
        new("playback.seek", requestId, time);

    public static YtmFocusMessage FocusYouTubeMusic(string requestId) =>
        new("ytm.focus", requestId);
}

public sealed record ConnectorManifest(
    string Id,
    string Name,
    string Version,
    string ProtocolVersion,
    IReadOnlyList<string> Permissions
);

public sealed record ConnectorHelloMessage(
    string Type,
    string RequestId,
    ConnectorManifest Manifest
);

public sealed record ConnectorSubscribeMessage(
    string Type,
    string RequestId,
    IReadOnlyList<string> Events
);

public sealed record PlaybackGetStateMessage(string Type, string RequestId);

public sealed record PlaybackActionMessage(
    string Type,
    string RequestId,
    string Action
);

public sealed record PlaybackSeekMessage(
    string Type,
    string RequestId,
    double Time
);

public sealed record YtmFocusMessage(string Type, string RequestId);

public sealed record ConnectorSource(
    string Id,
    string Name,
    bool IsDevBuild,
    string? ExtensionId
)
{
    public string DisplayName => IsDevBuild ? $"{Name} (dev)" : Name;
}

public sealed record ConnectorErrorMessage(
    string Type,
    string? RequestId,
    string Code,
    string Message
);

public sealed record ActiveBrowserConnection(
    int ProcessId,
    DateTimeOffset ConnectedAt,
    ConnectorSource? Source
);

public sealed record TrackMetadata(
    string? Title,
    string? Artist,
    string? Album,
    int? Year,
    string? ArtworkUrl
);

public sealed record PlaybackState(
    string? Title,
    string? Artist,
    string? Album,
    int? Year,
    string? ArtworkUrl,
    TrackMetadata? NextTrack,
    bool IsPlaying,
    double Progress,
    double Duration,
    bool? IsShuffling,
    string? RepeatMode
);

public sealed class HostMessage
{
    public string Type { get; set; } = "";
    public string? RequestId { get; set; }
    public PlaybackState? State { get; set; }
    public ConnectorSource? Source { get; set; }
    public string? Code { get; set; }
    public string? Message { get; set; }
}

public static partial class ConnectorProtocol
{
    public static ConnectorErrorMessage AppBusy(ActiveBrowserConnection? connection) =>
        new("connector.error", null, "app_busy", AppBusyMessage(connection?.Source));

    private static string AppBusyMessage(ConnectorSource? source)
    {
        var browser = source?.DisplayName ?? "another browser";
        return $"YTM Tray is already connected to {browser}. Disconnect that browser before connecting here.";
    }
}
