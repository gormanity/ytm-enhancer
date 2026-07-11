namespace YTMTray.Core;

public sealed record PlaybackItemIdentity(
    string Title,
    string Artist,
    string Album,
    int DurationSeconds
)
{
    public static PlaybackItemIdentity From(PlaybackState state) =>
        new(
            Normalize(state.Title),
            Normalize(state.Artist),
            Normalize(state.Album),
            (int)Math.Round(state.Duration, MidpointRounding.AwayFromZero)
        );

    private static string Normalize(string? value) => value?.Trim() ?? "";
}

public sealed class PendingSeekTracker
{
    public static readonly TimeSpan DefaultHoldDuration = TimeSpan.FromSeconds(1.5);
    public const double DefaultToleranceSeconds = 1.25;

    private readonly TimeProvider timeProvider;
    private readonly TimeSpan holdDuration;
    private readonly double toleranceSeconds;
    private double? pendingTime;
    private DateTimeOffset? expiresAt;
    private PlaybackItemIdentity? pendingItem;

    public PendingSeekTracker(
        TimeProvider? timeProvider = null,
        TimeSpan? holdDuration = null,
        double toleranceSeconds = DefaultToleranceSeconds
    )
    {
        this.timeProvider = timeProvider ?? TimeProvider.System;
        this.holdDuration = holdDuration ?? DefaultHoldDuration;
        this.toleranceSeconds = Math.Max(0, toleranceSeconds);
    }

    public void Begin(double time, double duration, PlaybackItemIdentity item)
    {
        if (duration <= 0)
        {
            Clear();
            return;
        }

        pendingTime = Math.Clamp(time, 0, duration);
        expiresAt = timeProvider.GetUtcNow() + holdDuration;
        pendingItem = item;
    }

    public double DisplayProgress(
        double reportedProgress,
        double duration,
        PlaybackItemIdentity item
    )
    {
        if (pendingTime is not double pending || expiresAt is not DateTimeOffset expiration)
        {
            return reportedProgress;
        }

        if (pendingItem != item)
        {
            Clear();
            return reportedProgress;
        }

        if (duration <= 0 || timeProvider.GetUtcNow() > expiration)
        {
            Clear();
            return reportedProgress;
        }

        if (Math.Abs(reportedProgress - pending) <= toleranceSeconds)
        {
            Clear();
            return reportedProgress;
        }

        return Math.Clamp(pending, 0, duration);
    }

    public void Clear()
    {
        pendingTime = null;
        expiresAt = null;
        pendingItem = null;
    }
}
