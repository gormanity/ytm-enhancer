namespace YTMTray.Core;

public enum WindowsTrayUpdatePhase
{
    Idle,
    Checking,
    UpToDate,
    UpdateAvailable,
    Downloading,
    Failed
}

public sealed class WindowsTrayUpdateSession
{
    public WindowsTrayUpdatePhase Phase { get; private set; } =
        WindowsTrayUpdatePhase.Idle;

    public WindowsTrayUpdateCheckResult? AvailableUpdate { get; private set; }

    public string? Error { get; private set; }

    public bool IsCheckInProgress { get; private set; }

    public bool HasUpdateAvailable =>
        AvailableUpdate is not null
        && Phase
            is WindowsTrayUpdatePhase.UpdateAvailable
                or WindowsTrayUpdatePhase.Downloading;

    public bool TryBeginCheck(
        bool reuseAvailableUpdate,
        out WindowsTrayUpdateCheckResult? cachedUpdate
    )
    {
        if (IsCheckInProgress)
        {
            cachedUpdate = null;
            return false;
        }

        cachedUpdate =
            reuseAvailableUpdate && Phase == WindowsTrayUpdatePhase.UpdateAvailable
                ? AvailableUpdate
                : null;
        IsCheckInProgress = true;
        AvailableUpdate = null;
        Error = null;
        Phase = WindowsTrayUpdatePhase.Checking;
        return true;
    }

    public void ApplyResult(WindowsTrayUpdateCheckResult update)
    {
        var updateAvailable =
            update.IsUpdateAvailable && !string.IsNullOrWhiteSpace(update.LatestVersion);
        AvailableUpdate = updateAvailable ? update : null;
        Error = null;
        Phase = updateAvailable
            ? WindowsTrayUpdatePhase.UpdateAvailable
            : WindowsTrayUpdatePhase.UpToDate;
    }

    public void BeginDownload()
    {
        if (!HasUpdateAvailable)
        {
            throw new InvalidOperationException(
                "An available update is required before downloading."
            );
        }

        Phase = WindowsTrayUpdatePhase.Downloading;
    }

    public void Fail(string error)
    {
        AvailableUpdate = null;
        Error = error;
        Phase = WindowsTrayUpdatePhase.Failed;
    }

    public void CompleteCheck()
    {
        IsCheckInProgress = false;
    }
}
