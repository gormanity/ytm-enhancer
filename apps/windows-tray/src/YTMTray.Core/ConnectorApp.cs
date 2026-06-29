namespace YTMTray.Core;

public sealed class ConnectorApp : IDisposable
{
    private static readonly TimeSpan PlaybackStateRetryDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan PlaybackStateStaleTimeout = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan StaleProgressTolerance = TimeSpan.FromSeconds(0.25);

    private readonly IConnectorConnection connection;
    private readonly ITrayController tray;
    private readonly NativeAppLogger logger;
    private int nextRequestNumber;
    private bool ready;
    private PlaybackState? lastAcceptedPlaybackState;
    private Timer? playbackStateRetry;
    private Timer? playbackStateStaleTimeout;

    public ConnectorApp(
        IConnectorConnection connection,
        ITrayController tray,
        NativeAppLogger? logger = null
    )
    {
        this.connection = connection;
        this.tray = tray;
        this.logger = logger ?? new NativeAppLogger();
    }

    public void Start()
    {
        tray.OnShuffle = () => SendAction("shuffle");
        tray.OnPrevious = () => SendAction("previous");
        tray.OnTogglePlay = () => SendAction("togglePlay");
        tray.OnNext = () => SendAction("next");
        tray.OnRepeat = () => SendAction("repeat");
        tray.OnSeek = SendSeek;
        tray.OnFocusYouTubeMusic = SendFocusYouTubeMusic;

        logger.Log("connector app starting");
        connection.Start(Handle, HandleDisconnect);
        _ = connection.SendAsync(ConnectorProtocol.Hello(NextRequestId("hello")));
    }

    public void Dispose()
    {
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();
        connection.Dispose();
    }

    private void Handle(HostMessage message)
    {
        logger.Log(
            $"handling message type={message.Type} requestId={message.RequestId ?? "none"}"
        );

        switch (message.Type)
        {
            case "connector.ready":
                ready = true;
                ClearPlaybackStateStaleTimeout();
                tray.UpdateConnectionStatus("Connected");
                _ = connection.SendAsync(
                    ConnectorProtocol.SubscribePlayback(NextRequestId("subscribe"))
                );
                RequestPlaybackState();
                break;
            case "playback.state":
                if (message.State is not null)
                {
                    HandlePlaybackState(message.State);
                }
                else
                {
                    logger.Log("playback state message missing state payload");
                }
                break;
            case "connector.error":
                HandleConnectorError(message);
                break;
            case ConnectorProtocol.UninstallRequestedType:
                logger.Log("connector uninstall requested");
                tray.RequestUninstall();
                break;
            default:
                logger.Log($"ignored message type={message.Type}");
                break;
        }
    }

    private void HandleDisconnect()
    {
        logger.Log("connector disconnected");
        ready = false;
        lastAcceptedPlaybackState = null;
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();
        tray.UpdateConnectionStatus("Disconnected");
    }

    private void HandlePlaybackState(PlaybackState state)
    {
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();

        if (ShouldKeepStalePlaybackState(state))
        {
            logger.Log("playback state still stale; ignoring non-advancing poll");
            tray.SetStalePlaybackState();
            SchedulePlaybackStateStaleTimeout();
            return;
        }

        lastAcceptedPlaybackState = state;
        tray.UpdatePlayback(state);

        if (state.IsPlaying)
        {
            SchedulePlaybackStateStaleTimeout();
        }
    }

    private void HandleConnectorError(HostMessage message)
    {
        var label = UserFacingStatus(message.Code, message.Message);
        logger.Log($"connector error {label}");

        if (message.Code == "connector_not_registered")
        {
            RestartHandshake(label);
            return;
        }

        if (IsPlaybackStateRequestError(message))
        {
            tray.UpdateConnectionStatus(label);
            SchedulePlaybackStateRetry();
            return;
        }

        if (IsConnectorAvailabilityError(message.Code))
        {
            ready = false;
            lastAcceptedPlaybackState = null;
            ClearPlaybackStateRetry();
            ClearPlaybackStateStaleTimeout();
        }

        tray.UpdateConnectionStatus(label);
    }

    private void RequestPlaybackState()
    {
        if (!ready)
        {
            logger.Log("playback state refresh skipped; connector is not ready");
            return;
        }

        ClearPlaybackStateRetry();
        _ = connection.SendAsync(
            ConnectorProtocol.PlaybackStateRequest(NextRequestId("state"))
        );
    }

    private void SendAction(string action)
    {
        if (!ready) return;
        _ = connection.SendAsync(
            ConnectorProtocol.PlaybackAction(action, NextRequestId("action"))
        );
    }

    private void SendSeek(double time)
    {
        if (!ready) return;
        _ = connection.SendAsync(ConnectorProtocol.PlaybackSeek(time, NextRequestId("seek")));
    }

    private void SendFocusYouTubeMusic()
    {
        if (!ready) return;
        _ = connection.SendAsync(ConnectorProtocol.FocusYouTubeMusic(NextRequestId("focus")));
    }

    private string NextRequestId(string prefix) =>
        $"{prefix}-{Interlocked.Increment(ref nextRequestNumber)}";

    private bool IsPlaybackStateRequestError(HostMessage message) =>
        message.RequestId?.StartsWith("state-", StringComparison.Ordinal) == true
        && (
            message.Message?.Contains("Receiving end does not exist") == true
            || message.Message?.Contains("No active YouTube Music tab") == true
            || message.Message?.Contains("No YouTube Music tab") == true
        );

    private void SchedulePlaybackStateRetry()
    {
        ClearPlaybackStateRetry();
        playbackStateRetry = new Timer(
            _ => RequestPlaybackState(),
            null,
            PlaybackStateRetryDelay,
            Timeout.InfiniteTimeSpan
        );
    }

    private void SchedulePlaybackStateStaleTimeout()
    {
        ClearPlaybackStateStaleTimeout();
        playbackStateStaleTimeout = new Timer(
            _ =>
            {
                tray.SetStalePlaybackState();
                RequestPlaybackState();
            },
            null,
            PlaybackStateStaleTimeout,
            Timeout.InfiniteTimeSpan
        );
    }

    private void RestartHandshake(string reason)
    {
        ready = false;
        lastAcceptedPlaybackState = null;
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();
        tray.UpdateConnectionStatus(reason);
        _ = connection.SendAsync(ConnectorProtocol.Hello(NextRequestId("hello")));
    }

    private bool ShouldKeepStalePlaybackState(PlaybackState state)
    {
        if (lastAcceptedPlaybackState is null) return false;
        if (!lastAcceptedPlaybackState.IsPlaying || !state.IsPlaying) return false;
        if (!SamePlaybackItem(lastAcceptedPlaybackState, state)) return false;
        return Math.Abs(state.Progress - lastAcceptedPlaybackState.Progress)
            <= StaleProgressTolerance.TotalSeconds;
    }

    private static bool SamePlaybackItem(PlaybackState a, PlaybackState b) =>
        a.Title == b.Title
        && a.Artist == b.Artist
        && a.Album == b.Album
        && a.Year == b.Year
        && a.ArtworkUrl == b.ArtworkUrl;

    private static bool IsConnectorAvailabilityError(string? code) =>
        code is "host_disabled" or "connector_blocked" or "unsupported_protocol";

    private static string UserFacingStatus(string? code, string? message) =>
        code switch
        {
            "host_disabled" => "Connected Apps disabled",
            "connector_blocked" => "Connector disabled",
            "unsupported_protocol" => "Update required",
            "connector_not_registered" => "Reconnecting...",
            _ when message?.Contains("No active YouTube Music tab") == true =>
                "No YouTube Music tab",
            _ when message?.Contains("No YouTube Music tab") == true =>
                "No YouTube Music tab",
            _ => string.IsNullOrWhiteSpace(message) ? "Unavailable" : message
        };

    private void ClearPlaybackStateRetry()
    {
        playbackStateRetry?.Dispose();
        playbackStateRetry = null;
    }

    private void ClearPlaybackStateStaleTimeout()
    {
        playbackStateStaleTimeout?.Dispose();
        playbackStateStaleTimeout = null;
    }
}
