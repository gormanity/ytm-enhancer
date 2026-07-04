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
        string initialStatus,
        bool openPopupForTest = false
    )
    {
        this.connection = connection;
        trayController = new TrayController(initialStatus, logger: logger);
        trayController.OnQuit = ExitThread;
        connectorApp = new ConnectorApp(connection, trayController, logger);
        connectorApp.Start();
        trayController.StartBackgroundUpdateCheck();
        if (openPopupForTest)
        {
            trayController.OpenPopupForTest();
        }
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
