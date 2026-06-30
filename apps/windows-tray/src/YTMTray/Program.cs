using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal static class Program
{
    private const string MutexName = "Local\\YTMEnhancerTray";
    private const string VisualDemoEnvironmentVariable = "YTM_TRAY_VISUAL_DEMO";
    private const string VisualDemoStatusEnvironmentVariable = "YTM_TRAY_VISUAL_STATUS";

    [STAThread]
    private static void Main()
    {
        var logger = new NativeAppLogger();
        logger.Log("starting YTM Tray");

        using var mutex = new Mutex(true, MutexName, out var createdNew);
        if (!createdNew)
        {
            logger.Log("existing tray instance detected; terminating direct launch");
            return;
        }

        var useVisualDemo = Environment.GetEnvironmentVariable(
            VisualDemoEnvironmentVariable
        ) == "1";
        var visualDemoStatus = Environment.GetEnvironmentVariable(
            VisualDemoStatusEnvironmentVariable
        );
        IConnectorConnection connection = useVisualDemo
            ? new DemoConnectorConnection(visualDemoStatus)
            : new BridgeUiConnection(logger: logger);
        RunTray(connection, logger, useVisualDemo ? "Connected" : "Waiting for YTM Enhancer");
    }

    private static void RunTray(
        IConnectorConnection connection,
        NativeAppLogger logger,
        string initialStatus
    )
    {
        Application.SetHighDpiMode(HighDpiMode.SystemAware);
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        using var context = new TrayApplicationContext(connection, logger, initialStatus);
        Application.Run(context);
    }
}

internal sealed class DemoConnectorConnection : IConnectorConnection
{
    private const string VisualDemoArtworkUrlEnvironmentVariable =
        "YTM_TRAY_VISUAL_ARTWORK_URL";
    private const string VisualDemoNextArtworkUrlEnvironmentVariable =
        "YTM_TRAY_VISUAL_NEXT_ARTWORK_URL";

    private readonly string? visualStatus;
    private readonly string? currentArtworkUrl;
    private readonly string? nextArtworkUrl;
    private readonly bool useScrollQaMetadata;
    private Action<HostMessage>? onMessage;

    public DemoConnectorConnection(string? visualStatus = null)
    {
        this.visualStatus = string.IsNullOrWhiteSpace(visualStatus)
            ? null
            : visualStatus;
        currentArtworkUrl = OptionalEnvironmentValue(VisualDemoArtworkUrlEnvironmentVariable);
        nextArtworkUrl = OptionalEnvironmentValue(
            VisualDemoNextArtworkUrlEnvironmentVariable
        );
        useScrollQaMetadata = Environment.GetEnvironmentVariable("YTM_TRAY_SCROLL_QA") == "1";
    }

    public void Start(Action<HostMessage> onMessage, Action onDisconnect)
    {
        this.onMessage = onMessage;
    }

    public Task SendAsync(object message, CancellationToken cancellationToken = default)
    {
        switch (message)
        {
            case ConnectorHelloMessage:
                Emit(new HostMessage { Type = "connector.ready" });
                break;
            case PlaybackGetStateMessage playbackStateMessage:
                Emit(
                    visualStatus is null
                        ? new HostMessage
                        {
                            Type = "playback.state",
                            State = DemoPlaybackState(
                                useScrollQaMetadata,
                                currentArtworkUrl,
                                nextArtworkUrl
                            )
                        }
                        : new HostMessage
                        {
                            Type = "connector.error",
                            RequestId = playbackStateMessage.RequestId,
                            Message = visualStatus
                        }
                );
                break;
        }

        return Task.CompletedTask;
    }

    public void Stop() { }

    public void Dispose() { }

    private void Emit(HostMessage message) =>
        ThreadPool.QueueUserWorkItem(_ => onMessage?.Invoke(message));

    private static string? OptionalEnvironmentValue(string name)
    {
        var value = Environment.GetEnvironmentVariable(name);
        return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static PlaybackState DemoPlaybackState(
        bool useLongMetadata,
        string? currentArtworkUrl,
        string? nextArtworkUrl
    )
    {
        if (useLongMetadata)
        {
            return new PlaybackState(
                "A Walk Through a Wide Release QA Title",
                "Tycho and the Extended QA Ensemble",
                "Dive Into a Very Wide Album Name",
                2011,
                currentArtworkUrl,
                new TrackMetadata(
                    "Send and Receive (Chachi Jones Remix)",
                    "Tycho and the Extended QA Ensemble",
                    null,
                    null,
                    nextArtworkUrl
                ),
                true,
                178,
                317,
                false,
                "off"
            );
        }

        return new PlaybackState(
            "A Walk",
            "Tycho",
            "Dive",
            2011,
            currentArtworkUrl,
            new TrackMetadata("Hours", "Tycho", null, null, nextArtworkUrl),
            true,
            178,
            317,
            false,
            "off"
        );
    }
}
