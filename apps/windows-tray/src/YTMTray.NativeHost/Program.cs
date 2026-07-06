using YTMTray.Core;

var logger = new NativeAppLogger();
logger.Log("starting YTM Tray native host");

await using var bridgeClient = await TrayBridge.ConnectIfAvailableAsync(
    logger,
    TimeSpan.FromMilliseconds(500)
);
if (bridgeClient is null)
{
    var activeConnection = TrayBridge.ReadActiveConnection(logger);
    if (activeConnection is not null)
    {
        await NativeMessagingCodec.WriteMessageAsync(
            Console.OpenStandardOutput(),
            ConnectorProtocol.AppBusy(activeConnection)
        );
    }
    logger.Log("no resident tray bridge available; exiting native host");
    return;
}

await TrayBridge.RelayAsync(
    Console.OpenStandardInput(),
    Console.OpenStandardOutput(),
    bridgeClient,
    logger
);
