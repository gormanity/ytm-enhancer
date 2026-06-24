namespace YTMTray.Core;

public interface IConnectorConnection : IDisposable
{
    void Start(Action<HostMessage> onMessage, Action onDisconnect);
    Task SendAsync(object message, CancellationToken cancellationToken = default);
    void Stop();
}
