using System.Diagnostics;

namespace YTMTray.Core;

public sealed class ConnectorApp : IDisposable
{
    private static readonly TimeSpan DefaultPlaybackStateRetryDelay = TimeSpan.FromSeconds(2);
    private static readonly TimeSpan DefaultPlaybackStateStaleTimeout = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan StaleProgressTolerance = TimeSpan.FromSeconds(0.25);

    private readonly IConnectorConnection connection;
    private readonly ITrayController tray;
    private readonly NativeAppLogger logger;
    private readonly Action openYouTubeMusic;
    private readonly TimeSpan playbackStateRetryDelay;
    private readonly TimeSpan playbackStateStaleDelay;
    private int nextRequestNumber;
    private bool ready;
    private bool disposed;
    private volatile bool playbackStateStale;
    private PlaybackState? lastAcceptedPlaybackState;
    private Timer? playbackStateRetry;
    private Timer? playbackStateStaleTimeout;

    public ConnectorApp(
        IConnectorConnection connection,
        ITrayController tray,
        NativeAppLogger? logger = null,
        TimeSpan? playbackStateRetryDelay = null,
        TimeSpan? playbackStateStaleTimeout = null,
        Action? openYouTubeMusic = null
    )
    {
        this.connection = connection;
        this.tray = tray;
        this.logger = logger ?? new NativeAppLogger();
        this.openYouTubeMusic =
            openYouTubeMusic ?? OpenYouTubeMusicInDefaultBrowser;
        this.playbackStateRetryDelay =
            playbackStateRetryDelay ?? DefaultPlaybackStateRetryDelay;
        playbackStateStaleDelay =
            playbackStateStaleTimeout ?? DefaultPlaybackStateStaleTimeout;
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
        if (disposed) return;

        disposed = true;
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
                playbackStateStale = false;
                ClearPlaybackStateStaleTimeout();
                tray.UpdateConnectionStatus("Connected");
                tray.UpdateBrowserSource(message.Source);
                logger.Log(
                    $"connector ready source={message.Source?.DisplayName ?? "unknown"}"
                );
                _ = connection.SendAsync(
                    ConnectorProtocol.SubscribePlayback(NextRequestId("subscribe"))
                );
                RequestPlaybackState();
                RequestYtmStatus();
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
            case "ytm.status":
                if (message.Status is not null)
                {
                    tray.UpdateYouTubeMusicTabAvailability(message.Status.HasTabs);
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
        playbackStateStale = false;
        lastAcceptedPlaybackState = null;
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();
        tray.UpdateConnectionStatus("Disconnected");
        tray.UpdateBrowserSource(null);
        tray.UpdateYouTubeMusicTabAvailability(false);

        if (!disposed)
        {
            _ = connection.SendAsync(ConnectorProtocol.Hello(NextRequestId("hello")));
        }
    }

    private void HandlePlaybackState(PlaybackState state)
    {
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();
        tray.UpdateYouTubeMusicTabAvailability(true);
        logger.Log(PlaybackStateSummary(state));

        if (ShouldKeepStalePlaybackState(state))
        {
            logger.Log("playback state still stale; ignoring non-advancing poll");
            tray.SetStalePlaybackState();
            SchedulePlaybackStateStaleTimeout();
            return;
        }

        lastAcceptedPlaybackState = state;
        playbackStateStale = false;
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

        if (IsUnsupportedYtmStatusRequestError(message))
        {
            logger.Log("ignoring unsupported YouTube Music status request");
            return;
        }

        if (message.Code == "connector_not_registered")
        {
            RestartHandshake(label);
            return;
        }

        if (IsFocusYouTubeMusicRequestError(message))
        {
            tray.UpdateYouTubeMusicTabAvailability(false);
            OpenYouTubeMusicLocally("extension could not find a YouTube Music tab");
            return;
        }

        if (IsPlaybackStateRequestError(message))
        {
            tray.UpdateYouTubeMusicTabAvailability(false);
            tray.UpdateConnectionStatus(label);
            SchedulePlaybackStateRetry();
            return;
        }

        if (IsConnectorAvailabilityError(message.Code))
        {
            ready = false;
            playbackStateStale = false;
            lastAcceptedPlaybackState = null;
            ClearPlaybackStateRetry();
            ClearPlaybackStateStaleTimeout();
            tray.UpdateBrowserSource(null);
            tray.UpdateYouTubeMusicTabAvailability(false);
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

    private void RequestYtmStatus()
    {
        if (!ready) return;
        _ = connection.SendAsync(
            ConnectorProtocol.YtmStatusRequest(NextRequestId("ytm-status"))
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
        if (!ready)
        {
            OpenYouTubeMusicLocally("connector is not ready");
            return;
        }
        _ = connection.SendAsync(ConnectorProtocol.FocusYouTubeMusic(NextRequestId("focus")));
    }

    private string NextRequestId(string prefix) =>
        $"{prefix}-{Interlocked.Increment(ref nextRequestNumber)}";

    private bool IsPlaybackStateRequestError(HostMessage message) =>
        message.RequestId?.StartsWith("state-", StringComparison.Ordinal) == true
        && IsMissingYouTubeMusicTabMessage(message.Message);

    private bool IsFocusYouTubeMusicRequestError(HostMessage message) =>
        message.RequestId?.StartsWith("focus-", StringComparison.Ordinal) == true
        && IsMissingYouTubeMusicTabMessage(message.Message);

    private static bool IsUnsupportedYtmStatusRequestError(HostMessage message) =>
        message.RequestId?.StartsWith("ytm-status-", StringComparison.Ordinal) == true
        && message.Code == "invalid_message";

    private void SchedulePlaybackStateRetry()
    {
        ClearPlaybackStateRetry();
        playbackStateRetry = new Timer(
            _ => RequestPlaybackState(),
            null,
            playbackStateRetryDelay,
            Timeout.InfiniteTimeSpan
        );
    }

    private void SchedulePlaybackStateStaleTimeout()
    {
        ClearPlaybackStateStaleTimeout();
        playbackStateStaleTimeout = new Timer(
            _ =>
            {
                playbackStateStale = true;
                tray.SetStalePlaybackState();
                RequestPlaybackState();
            },
            null,
            playbackStateStaleDelay,
            Timeout.InfiniteTimeSpan
        );
    }

    private void RestartHandshake(string reason)
    {
        ready = false;
        playbackStateStale = false;
        lastAcceptedPlaybackState = null;
        ClearPlaybackStateRetry();
        ClearPlaybackStateStaleTimeout();
        tray.UpdateConnectionStatus(reason);
        tray.UpdateBrowserSource(null);
        tray.UpdateYouTubeMusicTabAvailability(false);
        _ = connection.SendAsync(ConnectorProtocol.Hello(NextRequestId("hello")));
    }

    private void OpenYouTubeMusicLocally(string reason)
    {
        logger.Log($"opening YouTube Music in the default browser because {reason}");
        try
        {
            openYouTubeMusic();
        }
        catch (Exception error)
        {
            logger.Log($"could not open YouTube Music: {error.Message}");
            tray.UpdateConnectionStatus("Could not open YouTube Music");
        }
    }

    private static void OpenYouTubeMusicInDefaultBrowser()
    {
        Process.Start(
            new ProcessStartInfo("https://music.youtube.com/")
            {
                UseShellExecute = true
            }
        );
    }

    private bool ShouldKeepStalePlaybackState(PlaybackState state)
    {
        if (!playbackStateStale) return false;
        if (lastAcceptedPlaybackState is null) return false;
        if (state.Duration <= 0) return false;
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
        && a.ArtworkUrl == b.ArtworkUrl
        && a.IsShuffling == b.IsShuffling
        && a.RepeatMode == b.RepeatMode
        && Math.Abs(a.Duration - b.Duration) <= StaleProgressTolerance.TotalSeconds
        && SameTrackMetadata(a.NextTrack, b.NextTrack);

    private static bool SameTrackMetadata(TrackMetadata? a, TrackMetadata? b)
    {
        if (a is null || b is null) return a is null && b is null;

        return a.Title == b.Title
            && a.Artist == b.Artist
            && a.Album == b.Album
            && a.Year == b.Year
            && a.ArtworkUrl == b.ArtworkUrl;
    }

    private static string PlaybackStateSummary(PlaybackState state) =>
        string.Join(
            " ",
            [
                "playback state",
                $"title={LogValue(state.Title)}",
                $"artist={LogValue(state.Artist)}",
                $"album={LogValue(state.Album)}",
                $"artwork={LogValue(state.ArtworkUrl)}",
                $"nextTrack={LogValue(state.NextTrack?.Title)}",
                $"nextTrackArtwork={LogValue(state.NextTrack?.ArtworkUrl)}",
                $"year={state.Year?.ToString() ?? "nil"}",
                $"playing={state.IsPlaying}",
                $"progress={Math.Round(state.Progress)}",
                $"duration={Math.Round(state.Duration)}",
                $"shuffle={state.IsShuffling?.ToString() ?? "nil"}",
                $"repeat={state.RepeatMode ?? "nil"}"
            ]
        );

    private static string LogValue(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "nil" : value;

    private static bool IsConnectorAvailabilityError(string? code) =>
        code is "host_disabled" or "connector_blocked" or "unsupported_protocol";

    private static bool IsMissingYouTubeMusicTabMessage(string? message) =>
        message?.Contains("Receiving end does not exist", StringComparison.OrdinalIgnoreCase)
            == true
        || message?.Contains(
                "No active YouTube Music tab",
                StringComparison.OrdinalIgnoreCase
            )
            == true
        || message?.Contains("No YouTube Music tab", StringComparison.OrdinalIgnoreCase)
            == true
        || message?.Contains("No YTM tab", StringComparison.OrdinalIgnoreCase) == true;

    private static string UserFacingStatus(string? code, string? message) =>
        code switch
        {
            "host_disabled" => "Connected Apps disabled",
            "connector_blocked" => "Connector disabled",
            "unsupported_protocol" => "Update required",
            "connector_not_registered" => "Reconnecting...",
            _ when IsMissingYouTubeMusicTabMessage(message) => "No YouTube Music tab",
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
