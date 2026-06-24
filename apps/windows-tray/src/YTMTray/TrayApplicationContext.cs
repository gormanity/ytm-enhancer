using System.Windows.Forms;
using YTMTray.Core;

namespace YTMTray;

internal sealed class TrayApplicationContext : ApplicationContext
{
    private readonly IConnectorConnection connection;
    private readonly ConnectorApp connectorApp;
    private readonly TrayController trayController;

    public TrayApplicationContext(
        IConnectorConnection connection,
        NativeAppLogger logger,
        string initialStatus
    )
    {
        this.connection = connection;
        trayController = new TrayController(initialStatus);
        trayController.OnQuit = ExitThread;
        connectorApp = new ConnectorApp(connection, trayController, logger);
        connectorApp.Start();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            connectorApp.Dispose();
            trayController.Dispose();
            connection.Dispose();
        }

        base.Dispose(disposing);
    }
}
