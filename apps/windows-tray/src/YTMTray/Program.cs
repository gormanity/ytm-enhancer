using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal static class Program
{
    private const string MutexName = "Local\\YTMEnhancerTray";
    private const string VisualDemoEnvironmentVariable = "YTM_TRAY_VISUAL_DEMO";

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
        IConnectorConnection connection = useVisualDemo
            ? new DemoConnectorConnection()
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
    private Action<HostMessage>? onMessage;

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
            case PlaybackGetStateMessage:
                Emit(new HostMessage { Type = "playback.state", State = DemoPlaybackState() });
                break;
        }

        return Task.CompletedTask;
    }

    public void Stop() { }

    public void Dispose() { }

    private void Emit(HostMessage message) =>
        ThreadPool.QueueUserWorkItem(_ => onMessage?.Invoke(message));

    private static PlaybackState DemoPlaybackState() =>
        new(
            "A Walk Through the Longest Possible YouTube Music Title Fixture",
            "Tycho and the Extended QA Ensemble",
            "Dive Into a Very Wide Album Name for Tray Scrolling",
            2011,
            null,
            new TrackMetadata(
                "Send And Receive (Chachi Jones Remix) With Extra Words",
                "Tycho and the Extended QA Ensemble",
                null,
                null,
                null
            ),
            true,
            178,
            317,
            false,
            "off"
        );
}
