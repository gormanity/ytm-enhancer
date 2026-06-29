namespace YTMTray.Core;

public interface ITrayController
{
    Action? OnShuffle { get; set; }
    Action? OnPrevious { get; set; }
    Action? OnTogglePlay { get; set; }
    Action? OnNext { get; set; }
    Action? OnRepeat { get; set; }
    Action<double>? OnSeek { get; set; }
    Action? OnFocusYouTubeMusic { get; set; }

    void UpdateConnectionStatus(string status);
    void RequestUninstall();
    void SetStalePlaybackState();
    void UpdatePlayback(PlaybackState state);
}
