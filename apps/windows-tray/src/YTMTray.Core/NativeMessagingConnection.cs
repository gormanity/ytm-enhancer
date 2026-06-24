using System.Text.Json;

namespace YTMTray.Core;

public sealed class NativeMessagingConnection : IConnectorConnection
{
    private readonly Stream input;
    private readonly Stream output;
    private readonly NativeAppLogger logger;
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private CancellationTokenSource? cancellation;
    private bool running;

    public NativeMessagingConnection(
        Stream input,
        Stream output,
        NativeAppLogger? logger = null
    )
    {
        this.input = input;
        this.output = output;
        this.logger = logger ?? new NativeAppLogger();
    }

    public void Start(Action<HostMessage> onMessage, Action onDisconnect)
    {
        if (running) return;
        running = true;
        cancellation = new CancellationTokenSource();
        logger.Log("native messaging connection starting");

        _ = Task.Run(async () =>
        {
            try
            {
                while (!cancellation.IsCancellationRequested)
                {
                    using var document = await NativeMessagingCodec.ReadJsonAsync(
                        input,
                        cancellation.Token
                    );
                    if (document is null) break;

                    var message = document.RootElement.Deserialize<HostMessage>(
                        JsonSettings.Options
                    );
                    if (message is null || string.IsNullOrEmpty(message.Type))
                    {
                        logger.Log("received undecodable native message");
                        continue;
                    }

                    logger.Log(
                        $"received message type={message.Type} requestId={message.RequestId ?? "none"}"
                    );
                    onMessage(message);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected during shutdown.
            }
            catch (Exception error)
            {
                logger.Log($"native messaging read failed: {error.Message}");
            }
            finally
            {
                running = false;
                onDisconnect();
            }
        });
    }

    public async Task SendAsync(
        object message,
        CancellationToken cancellationToken = default
    )
    {
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            await NativeMessagingCodec.WriteMessageAsync(output, message, cancellationToken);
            logger.Log($"sent message type={MessageType(message)}");
        }
        catch (Exception error)
        {
            logger.Log($"native messaging write failed: {error.Message}");
        }
        finally
        {
            writeLock.Release();
        }
    }

    public void Stop()
    {
        cancellation?.Cancel();
        running = false;
    }

    public void Dispose()
    {
        Stop();
        cancellation?.Dispose();
        writeLock.Dispose();
    }

    private static string MessageType(object message)
    {
        var property = message.GetType().GetProperty("Type");
        return property?.GetValue(message) as string ?? "unknown";
    }
}
