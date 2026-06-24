using System.IO.Pipes;
using System.Runtime.Versioning;
using System.Security.Principal;
using System.Text.Json;

namespace YTMTray.Core;

[SupportedOSPlatform("windows")]
public static class TrayBridge
{
    public static string PipeName =>
        $"ytm-enhancer-tray-{CurrentUserToken()}";

    public static async Task<NamedPipeClientStream?> ConnectIfAvailableAsync(
        NativeAppLogger logger,
        TimeSpan timeout,
        CancellationToken cancellationToken = default
    )
    {
        var client = new NamedPipeClientStream(
            ".",
            PipeName,
            PipeDirection.InOut,
            PipeOptions.Asynchronous
        );

        try
        {
            await client.ConnectAsync((int)timeout.TotalMilliseconds, cancellationToken);
            logger.Log($"bridge client connected pipe={PipeName}");
            return client;
        }
        catch (Exception error)
        {
            logger.Log($"bridge client unavailable: {error.Message}");
            await client.DisposeAsync();
            return null;
        }
    }

    public static async Task RelayAsync(
        Stream nativeInput,
        Stream nativeOutput,
        Stream bridgeStream,
        NativeAppLogger logger,
        CancellationToken cancellationToken = default
    )
    {
        logger.Log("native messaging relay starting");

        var nativeToBridge = CopyLoopAsync(
            nativeInput,
            bridgeStream,
            "native-to-bridge",
            logger,
            cancellationToken
        );
        var bridgeToNative = CopyLoopAsync(
            bridgeStream,
            nativeOutput,
            "bridge-to-native",
            logger,
            cancellationToken
        );

        await Task.WhenAny(nativeToBridge, bridgeToNative);
    }

    private static async Task CopyLoopAsync(
        Stream input,
        Stream output,
        string label,
        NativeAppLogger logger,
        CancellationToken cancellationToken
    )
    {
        try
        {
            while (
                await NativeMessagingCodec.CopyOneMessageAsync(
                    input,
                    output,
                    cancellationToken
                )
            )
            {
                logger.Log($"relay copied {label} message");
            }
        }
        catch (Exception error)
        {
            logger.Log($"relay stopped {label}: {error.Message}");
        }
    }

    private static string CurrentUserToken()
    {
        try
        {
            return WindowsIdentity.GetCurrent().User?.Value.Replace("-", "_") ?? "unknown";
        }
        catch
        {
            return Environment.UserName.Replace(" ", "_");
        }
    }
}

[SupportedOSPlatform("windows")]
public sealed class BridgeUiConnection : IConnectorConnection
{
    private readonly string pipeName;
    private readonly NativeAppLogger logger;
    private readonly SemaphoreSlim writeLock = new(1, 1);
    private readonly List<object> pendingMessages = [];
    private Action<HostMessage>? onMessage;
    private Action? onDisconnect;
    private NamedPipeServerStream? server;
    private CancellationTokenSource? cancellation;
    private Stream? connectedClient;

    public BridgeUiConnection(string? pipeName = null, NativeAppLogger? logger = null)
    {
        this.pipeName = pipeName ?? TrayBridge.PipeName;
        this.logger = logger ?? new NativeAppLogger();
    }

    public void Start(Action<HostMessage> onMessage, Action onDisconnect)
    {
        this.onMessage = onMessage;
        this.onDisconnect = onDisconnect;
        cancellation = new CancellationTokenSource();
        _ = Task.Run(() => AcceptLoopAsync(cancellation.Token));
    }

    public async Task SendAsync(
        object message,
        CancellationToken cancellationToken = default
    )
    {
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            if (connectedClient is null)
            {
                pendingMessages.Add(message);
                if (pendingMessages.Count > 20)
                {
                    pendingMessages.RemoveAt(0);
                }
                return;
            }

            await NativeMessagingCodec.WriteMessageAsync(
                connectedClient,
                message,
                cancellationToken
            );
        }
        finally
        {
            writeLock.Release();
        }
    }

    public void Stop()
    {
        cancellation?.Cancel();
        connectedClient?.Dispose();
        connectedClient = null;
        server?.Dispose();
        server = null;
    }

    public void Dispose()
    {
        Stop();
        cancellation?.Dispose();
        writeLock.Dispose();
    }

    private async Task AcceptLoopAsync(CancellationToken cancellationToken)
    {
        logger.Log($"bridge server listening pipe={pipeName}");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                server = new NamedPipeServerStream(
                    pipeName,
                    PipeDirection.InOut,
                    1,
                    PipeTransmissionMode.Byte,
                    PipeOptions.Asynchronous
                );
                await server.WaitForConnectionAsync(cancellationToken);
                connectedClient = server;
                logger.Log("bridge server accepted native host");
                await FlushPendingMessagesAsync(cancellationToken);
                await ReadClientMessagesAsync(server, cancellationToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception error)
            {
                logger.Log($"bridge server failed: {error.Message}");
            }
            finally
            {
                connectedClient = null;
                onDisconnect?.Invoke();
                server?.Dispose();
                server = null;
            }
        }
    }

    private async Task FlushPendingMessagesAsync(CancellationToken cancellationToken)
    {
        await writeLock.WaitAsync(cancellationToken);
        try
        {
            var messages = pendingMessages.ToArray();
            pendingMessages.Clear();

            foreach (var message in messages)
            {
                if (connectedClient is null) return;
                await NativeMessagingCodec.WriteMessageAsync(
                    connectedClient,
                    message,
                    cancellationToken
                );
            }
        }
        finally
        {
            writeLock.Release();
        }
    }

    private async Task ReadClientMessagesAsync(
        Stream client,
        CancellationToken cancellationToken
    )
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            using var document = await NativeMessagingCodec.ReadJsonAsync(
                client,
                cancellationToken
            );
            if (document is null) break;

            var message = document.RootElement.Deserialize<HostMessage>(
                JsonSettings.Options
            );
            if (message is not null)
            {
                onMessage?.Invoke(message);
            }
        }
    }
}
