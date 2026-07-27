using System.IO.Compression;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Drawing;
using YTMTray.Core;

var tests = new (string Name, Func<Task> Run)[]
{
    ("protocol manifest uses tray connector identity", ProtocolManifest),
    ("protocol app busy diagnostic names the active browser", ProtocolAppBusyDiagnostic),
    ("native messaging codec round trips JSON frames", NativeMessagingCodecRoundTrip),
    ("bridge UI connection disposal is idempotent", BridgeUiConnectionDisposalIsIdempotent),
    ("connector app handshakes and subscribes after ready", ConnectorAppHandshake),
    ("connector app opens YTM while disconnected", ConnectorAppOpensYtmWhileDisconnected),
    ("connector app falls back to opening YTM after focus failure", ConnectorAppOpensYtmAfterFocusFailure),
    ("connector app tolerates older extensions without YTM status", ConnectorAppToleratesMissingYtmStatusRoute),
    ("connector app queues a fresh handshake after disconnect", ConnectorAppReconnectHandshake),
    ("connector app routes uninstall requests", ConnectorAppUninstallRequest),
    ("connector app updates tray playback state", ConnectorAppPlaybackState),
    ("connector app accepts immediate duplicate playing state", ConnectorAppAcceptsImmediateDuplicate),
    ("connector app rejects duplicate only after stale timeout", ConnectorAppRejectsDuplicateAfterStaleTimeout),
    ("connector app accepts duration updates after stale timeout", ConnectorAppAcceptsDurationUpdateAfterStaleTimeout),
    ("connector app accepts stale progress when next artwork changes", ConnectorAppAcceptsNextArtworkUpdate),
    ("connector app accepts shuffle updates after stale timeout", ConnectorAppAcceptsShuffleUpdateAfterStaleTimeout),
    ("connector app accepts repeat updates after stale timeout", ConnectorAppAcceptsRepeatUpdateAfterStaleTimeout),
    ("connector app normalizes missing tab errors", ConnectorAppNormalizesMissingTabError),
    ("connector app tracks YouTube Music tab availability", ConnectorAppTracksYouTubeMusicTabAvailability),
    ("pending seek holds optimistic progress until confirmed", PendingSeekHoldsOptimisticProgress),
    ("pending seek expires back to reported progress", PendingSeekExpires),
    ("pending seek clears optimistic progress when the track changes", PendingSeekClearsOnPlaybackItemChange),
    ("pending seek survives same-track metadata enrichment", PendingSeekSurvivesMetadataEnrichment),
    ("popup placement stays attached to tray anchors", PopupPlacementStaysAttachedToTrayAnchors),
    ("tray icon layout enlarges only idle glyph", TrayIconLayoutEnlargesOnlyIdleGlyph),
    ("artwork layout preserves source aspect ratios", ArtworkLayoutPreservesAspectRatios),
    (
        "Windows runtime identifiers follow the operating system architecture",
        WindowsRuntimeIdentifiersFollowOperatingSystemArchitecture
    ),
    (
        "setup process scope isolates the target installation",
        SetupProcessScopeIsolatesTargetInstallation
    ),
    ("update service finds newest tray release", UpdateServiceFindsNewestTrayRelease),
    ("update service ignores current tray release", UpdateServiceIgnoresCurrentTrayRelease),
    (
        "update session clears stale availability after a failed refresh",
        UpdateSessionClearsStaleAvailabilityAfterFailedRefresh
    ),
    (
        "update session reuses availability only for an install action",
        UpdateSessionReusesAvailabilityOnlyForInstallAction
    ),
    ("update options use packaged release version", UpdateOptionsUsePackagedReleaseVersion),
    ("update service prepares verified package", UpdateServicePreparesVerifiedPackage),
    ("update service launches native setup directly", UpdateServiceLaunchesNativeSetupDirectly),
    (
        "post-install launch policy handles user and updater flows",
        PostInstallLaunchPolicyHandlesUserAndUpdaterFlows
    ),
    (
        "post-install launch targets the installed tray app",
        PostInstallLaunchTargetsInstalledTrayApp
    ),
    ("update service rejects packages without native setup", UpdateServiceRejectsMissingNativeSetup),
    ("update service rejects unsafe package entries", UpdateServiceRejectsUnsafePackageEntries),
    ("update service rejects unsafe package names", UpdateServiceRejectsUnsafePackageNames)
};

static Task WindowsRuntimeIdentifiersFollowOperatingSystemArchitecture()
{
    AssertEqual(
        "win-x64",
        WindowsRuntimeIdentifier.FromArchitecture(Architecture.X64)
    );
    AssertEqual(
        "win-arm64",
        WindowsRuntimeIdentifier.FromArchitecture(Architecture.Arm64)
    );
    AssertThrows<PlatformNotSupportedException>(
        () => WindowsRuntimeIdentifier.FromArchitecture(Architecture.X86),
        "x86"
    );

    return Task.CompletedTask;
}

static Task SetupProcessScopeIsolatesTargetInstallation()
{
    var profileRoot = Path.Combine(
        Path.GetTempPath(),
        "ytm-tray-process-scope"
    );
    var installRoot = Path.Combine(
        profileRoot,
        "gorma",
        "YTM Enhancer",
        "Tray"
    );
    var otherUserRoot = Path.Combine(
        profileRoot,
        "codex",
        "YTM Enhancer",
        "Tray"
    );

    AssertEqual(
        true,
        WindowsTrayProcessScope.IsInstalledExecutable(
            Path.Combine(installRoot, "YTMTray.exe"),
            installRoot
        )
    );
    AssertEqual(
        true,
        WindowsTrayProcessScope.IsInstalledExecutable(
            Path.Combine(installRoot, "YTMTray.NativeHost.exe"),
            installRoot
        )
    );
    AssertEqual(
        false,
        WindowsTrayProcessScope.IsInstalledExecutable(
            Path.Combine(otherUserRoot, "YTMTray.exe"),
            installRoot
        )
    );
    AssertEqual(
        false,
        WindowsTrayProcessScope.IsInstalledExecutable(
            Path.Combine($"{installRoot}-other", "YTMTray.exe"),
            installRoot
        )
    );
    AssertEqual(
        false,
        WindowsTrayProcessScope.IsInstalledExecutable(null, installRoot)
    );

    return Task.CompletedTask;
}

var failures = new List<string>();
foreach (var test in tests)
{
    try
    {
        await test.Run();
        Console.WriteLine($"ok {test.Name}");
    }
    catch (Exception error)
    {
        failures.Add($"{test.Name}: {error.Message}");
        Console.Error.WriteLine($"not ok {test.Name}: {error}");
    }
}

if (failures.Count > 0)
{
    Console.Error.WriteLine($"{failures.Count} test(s) failed");
    Environment.Exit(1);
}

static Task ProtocolManifest()
{
    var hello = ConnectorProtocol.Hello("hello-1");

    AssertEqual("connector.hello", hello.Type);
    AssertEqual("com.gormanity.ytm-enhancer.tray", hello.Manifest.Id);
    AssertEqual("YTM Tray", hello.Manifest.Name);
    AssertEqual("1.0.0", hello.Manifest.ProtocolVersion);
    AssertContains("playback:read", hello.Manifest.Permissions);
    AssertContains("playback:control", hello.Manifest.Permissions);
    AssertContains("track:read", hello.Manifest.Permissions);
    AssertContains("ytm:focus", hello.Manifest.Permissions);

    return Task.CompletedTask;
}

static Task ProtocolAppBusyDiagnostic()
{
    var message = ConnectorProtocol.AppBusy(
        new ActiveBrowserConnection(
            Environment.ProcessId,
            DateTimeOffset.UtcNow,
            new ConnectorSource(
                "edge",
                "Microsoft Edge",
                true,
                "akkbieodbakphpfdibailajdknnmmoca"
            )
        )
    );

    var json = JsonSerializer.SerializeToElement(message, JsonSettings.Options);
    AssertEqual("connector.error", json.GetProperty("type").GetString());
    AssertEqual("app_busy", json.GetProperty("code").GetString());
    AssertEqual(
        "YTM Tray is already connected to Microsoft Edge (dev). Disconnect that browser before connecting here.",
        json.GetProperty("message").GetString()
    );
    return Task.CompletedTask;
}

static async Task NativeMessagingCodecRoundTrip()
{
    await using var stream = new MemoryStream();
    await NativeMessagingCodec.WriteMessageAsync(
        stream,
        ConnectorProtocol.PlaybackAction("togglePlay", "action-1")
    );
    stream.Position = 0;

    using var document = await NativeMessagingCodec.ReadJsonAsync(stream);
    AssertNotNull(document, "framed message");
    AssertEqual("playback.action", document!.RootElement.GetProperty("type").GetString());
    AssertEqual("action-1", document.RootElement.GetProperty("requestId").GetString());
    AssertEqual("togglePlay", document.RootElement.GetProperty("action").GetString());
}

#pragma warning disable CA1416
static Task BridgeUiConnectionDisposalIsIdempotent()
{
    var connection = new BridgeUiConnection($"ytm-tray-dispose-test-{Guid.NewGuid():N}");
    connection.Start(_ => { }, () => { });

    connection.Dispose();
    connection.Dispose();
    return Task.CompletedTask;
}
#pragma warning restore CA1416

static async Task ConnectorAppHandshake()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);

    app.Start();
    AssertEqual("connector.hello", connection.MessageTypeAt(0));

    connection.Emit(new HostMessage
    {
        Type = "connector.ready",
        RequestId = "hello-1",
        Source = new ConnectorSource("edge", "Microsoft Edge", false, "extension-id")
    });

    AssertEqual("Connected", tray.Status);
    AssertEqual("Microsoft Edge", tray.BrowserSource?.DisplayName);
    AssertEqual("connector.subscribe", connection.MessageTypeAt(1));
    AssertEqual("playback.getState", connection.MessageTypeAt(2));
    await Task.CompletedTask;
}

static Task ConnectorAppOpensYtmWhileDisconnected()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    var openCount = 0;
    using var app = new ConnectorApp(
        connection,
        tray,
        openYouTubeMusic: () => openCount += 1
    );

    app.Start();
    tray.OnFocusYouTubeMusic?.Invoke();

    AssertEqual(1, openCount);
    AssertEqual(1, connection.SentMessages.Count);
    return Task.CompletedTask;
}

static Task ConnectorAppOpensYtmAfterFocusFailure()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    var openCount = 0;
    using var app = new ConnectorApp(
        connection,
        tray,
        openYouTubeMusic: () => openCount += 1
    );
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    tray.OnFocusYouTubeMusic?.Invoke();
    AssertEqual("ytm.focus", connection.MessageTypeAt(4));
    connection.Emit(new HostMessage
    {
        Type = "connector.error",
        RequestId = "focus-5",
        Code = "route_failed",
        Message = "No active YouTube Music tab"
    });

    AssertEqual(1, openCount);
    return Task.CompletedTask;
}

static Task ConnectorAppToleratesMissingYtmStatusRoute()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    connection.Emit(new HostMessage
    {
        Type = "connector.error",
        RequestId = "ytm-status-4",
        Code = "invalid_message",
        Message = "Invalid connector message: unsupported type ytm.getStatus"
    });

    AssertEqual("Connected", tray.Status);
    return Task.CompletedTask;
}

static async Task ConnectorAppReconnectHandshake()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);

    app.Start();
    connection.Emit(new HostMessage
    {
        Type = "connector.ready",
        RequestId = "hello-1"
    });

    connection.Disconnect();

    AssertEqual("Disconnected", tray.Status);
    AssertEqual(false, tray.YouTubeMusicTabAvailable);
    AssertEqual("connector.hello", connection.MessageTypeAt(4));
    await Task.CompletedTask;
}

static Task ConnectorAppUninstallRequest()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);

    app.Start();
    connection.Emit(new HostMessage { Type = ConnectorProtocol.UninstallRequestedType });

    AssertEqual(true, tray.UninstallRequested);
    return Task.CompletedTask;
}

static Task ConnectorAppPlaybackState()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    var state = new PlaybackState(
        "Song",
        "Artist",
        "Album",
        2026,
        null,
        null,
        true,
        12,
        60,
        false,
        "off"
    );
    connection.Emit(new HostMessage { Type = "playback.state", State = state });

    AssertEqual("Song", tray.State?.Title);
    AssertEqual(true, tray.State?.IsPlaying);
    return Task.CompletedTask;
}

static Task ConnectorAppAcceptsImmediateDuplicate()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    var state = PlaybackStateFixture(progress: 12);
    connection.Emit(new HostMessage { Type = "playback.state", State = state });
    connection.Emit(new HostMessage { Type = "playback.state", State = state });

    AssertEqual(2, tray.UpdateCount);
    AssertEqual(0, tray.StaleCount);
    return Task.CompletedTask;
}

static async Task ConnectorAppRejectsDuplicateAfterStaleTimeout()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(
        connection,
        tray,
        playbackStateStaleTimeout: TimeSpan.FromMilliseconds(20)
    );
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    var state = PlaybackStateFixture(progress: 12);
    connection.Emit(new HostMessage { Type = "playback.state", State = state });
    await WaitUntilAsync(() => tray.StaleCount == 1, TimeSpan.FromSeconds(1));
    connection.Emit(new HostMessage { Type = "playback.state", State = state });

    AssertEqual(1, tray.UpdateCount);
    AssertEqual(2, tray.StaleCount);
}

static async Task ConnectorAppAcceptsDurationUpdateAfterStaleTimeout()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(
        connection,
        tray,
        playbackStateStaleTimeout: TimeSpan.FromMilliseconds(20)
    );
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12, duration: 60)
    });
    await WaitUntilAsync(() => tray.StaleCount == 1, TimeSpan.FromSeconds(1));
    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12, duration: 90)
    });

    AssertEqual(2, tray.UpdateCount);
    AssertEqual(90d, tray.State?.Duration);
}

static Task ConnectorAppNormalizesMissingTabError()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });
    connection.Emit(new HostMessage
    {
        Type = "connector.error",
        RequestId = "state-3",
        Code = "route_failed",
        Message = "Could not establish connection. Receiving end does not exist."
    });

    AssertEqual("No YouTube Music tab", tray.Status);
    AssertEqual(false, tray.YouTubeMusicTabAvailable);
    return Task.CompletedTask;
}

static Task ConnectorAppTracksYouTubeMusicTabAvailability()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(connection, tray);
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    AssertEqual("ytm.getStatus", connection.MessageTypeAt(3));

    connection.Emit(new HostMessage
    {
        Type = "ytm.status",
        Status = new YtmStatus(false, 0, false)
    });
    AssertEqual(false, tray.YouTubeMusicTabAvailable);

    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12)
    });
    AssertEqual(true, tray.YouTubeMusicTabAvailable);
    return Task.CompletedTask;
}

static Task PendingSeekHoldsOptimisticProgress()
{
    var clock = new ManualTimeProvider();
    var pendingSeek = new PendingSeekTracker(clock);
    var item = PlaybackItemIdentityFixture();
    pendingSeek.Begin(42, 100, item);

    AssertEqual(42d, pendingSeek.DisplayProgress(10, 100, item));
    AssertEqual(42.5d, pendingSeek.DisplayProgress(42.5, 100, item));
    AssertEqual(43d, pendingSeek.DisplayProgress(43, 100, item));
    return Task.CompletedTask;
}

static Task PendingSeekExpires()
{
    var clock = new ManualTimeProvider();
    var pendingSeek = new PendingSeekTracker(clock);
    var item = PlaybackItemIdentityFixture();
    pendingSeek.Begin(42, 100, item);
    clock.Advance(TimeSpan.FromSeconds(1.6));

    AssertEqual(10d, pendingSeek.DisplayProgress(10, 100, item));
    return Task.CompletedTask;
}

static Task PendingSeekClearsOnPlaybackItemChange()
{
    var clock = new ManualTimeProvider();
    var pendingSeek = new PendingSeekTracker(clock);
    var firstTrack = new PlaybackItemIdentity(
        "First Song",
        "Artist",
        "Album",
        100
    );
    var secondTrack = firstTrack with
    {
        Title = "Second Song"
    };
    pendingSeek.Begin(42, 100, firstTrack);

    AssertEqual(42d, pendingSeek.DisplayProgress(10, 100, firstTrack));
    AssertEqual(3d, pendingSeek.DisplayProgress(3, 100, secondTrack));
    AssertEqual(4d, pendingSeek.DisplayProgress(4, 100, firstTrack));
    return Task.CompletedTask;
}

static Task PendingSeekSurvivesMetadataEnrichment()
{
    var clock = new ManualTimeProvider();
    var pendingSeek = new PendingSeekTracker(clock);
    var initialState = new PlaybackState(
        " Song ",
        "Artist",
        "Album",
        null,
        null,
        null,
        true,
        10,
        100.4,
        false,
        "off"
    );
    var enrichedState = initialState with
    {
        Title = "Song",
        Year = 2026,
        ArtworkUrl = "https://example.test/current.jpg",
        Progress = 11,
        Duration = 100.49
    };
    pendingSeek.Begin(42, initialState.Duration, PlaybackItemIdentity.From(initialState));

    AssertEqual(
        42d,
        pendingSeek.DisplayProgress(
            enrichedState.Progress,
            enrichedState.Duration,
            PlaybackItemIdentity.From(enrichedState)
        )
    );
    return Task.CompletedTask;
}

static PlaybackItemIdentity PlaybackItemIdentityFixture() =>
    new(
        "Song",
        "Artist",
        "Album",
        100
    );

static PlaybackState PlaybackStateFixture(
    double progress,
    double duration = 60,
    bool? isShuffling = false,
    string? repeatMode = "off"
) =>
    new(
        "Song",
        "Artist",
        "Album",
        2026,
        null,
        null,
        true,
        progress,
        duration,
        isShuffling,
        repeatMode
    );

static async Task ConnectorAppAcceptsNextArtworkUpdate()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(
        connection,
        tray,
        playbackStateStaleTimeout: TimeSpan.FromMilliseconds(20)
    );
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    var initialState = new PlaybackState(
        "Song",
        "Artist",
        "Album",
        2026,
        "https://example.test/current.jpg",
        new TrackMetadata("Next Song", "Next Artist", null, null, null),
        true,
        12,
        60,
        false,
        "off"
    );
    var nextArtworkState = new PlaybackState(
        "Song",
        "Artist",
        "Album",
        2026,
        "https://example.test/current.jpg",
        new TrackMetadata(
            "Next Song",
            "Next Artist",
            null,
            null,
            "https://example.test/next.jpg"
        ),
        true,
        12,
        60,
        false,
        "off"
    );

    connection.Emit(new HostMessage { Type = "playback.state", State = initialState });
    await WaitUntilAsync(() => tray.StaleCount == 1, TimeSpan.FromSeconds(1));
    connection.Emit(new HostMessage { Type = "playback.state", State = nextArtworkState });

    AssertEqual("https://example.test/next.jpg", tray.State?.NextTrack?.ArtworkUrl);
    AssertEqual(2, tray.UpdateCount);
    AssertEqual(1, tray.StaleCount);
}

static async Task ConnectorAppAcceptsShuffleUpdateAfterStaleTimeout()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(
        connection,
        tray,
        playbackStateStaleTimeout: TimeSpan.FromMilliseconds(20)
    );
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12, isShuffling: false)
    });
    await WaitUntilAsync(() => tray.StaleCount == 1, TimeSpan.FromSeconds(1));
    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12, isShuffling: true)
    });

    AssertEqual(true, tray.State?.IsShuffling);
    AssertEqual(2, tray.UpdateCount);
    AssertEqual(1, tray.StaleCount);
}

static async Task ConnectorAppAcceptsRepeatUpdateAfterStaleTimeout()
{
    var connection = new FakeConnection();
    var tray = new FakeTrayController();
    using var app = new ConnectorApp(
        connection,
        tray,
        playbackStateStaleTimeout: TimeSpan.FromMilliseconds(20)
    );
    app.Start();
    connection.Emit(new HostMessage { Type = "connector.ready" });

    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12, repeatMode: "off")
    });
    await WaitUntilAsync(() => tray.StaleCount == 1, TimeSpan.FromSeconds(1));
    connection.Emit(new HostMessage
    {
        Type = "playback.state",
        State = PlaybackStateFixture(progress: 12, repeatMode: "all")
    });

    AssertEqual("all", tray.State?.RepeatMode);
    AssertEqual(2, tray.UpdateCount);
    AssertEqual(1, tray.StaleCount);
}

static Task PopupPlacementStaysAttachedToTrayAnchors()
{
    var primaryWorkingArea = new Rectangle(0, 0, 1920, 1080);
    var popupSize = new Size(424, 532);

    AssertEqual(
        new Point(1488, 518),
        TrayPopupPlacement.Calculate(primaryWorkingArea, popupSize, new Point(1900, 1060))
    );
    AssertEqual(
        new Point(8, 518),
        TrayPopupPlacement.Calculate(primaryWorkingArea, popupSize, new Point(10, 1060))
    );
    AssertEqual(
        new Point(1488, 8),
        TrayPopupPlacement.Calculate(primaryWorkingArea, popupSize, new Point(1900, 20))
    );
    AssertEqual(
        new Point(1488, 538),
        TrayPopupPlacement.Calculate(primaryWorkingArea, popupSize)
    );

    var taskbarWorkingArea = new Rectangle(0, 0, 1920, 1040);
    AssertEqual(
        new Point(1488, 498),
        TrayPopupPlacement.Calculate(
            taskbarWorkingArea,
            popupSize,
            new Point(1900, 1060)
        )
    );

    var leftMonitorWorkingArea = new Rectangle(-1920, 0, 1920, 1080);
    AssertEqual(
        new Point(-432, 518),
        TrayPopupPlacement.Calculate(
            leftMonitorWorkingArea,
            popupSize,
            new Point(-20, 1060)
        )
    );

    return Task.CompletedTask;
}

static Task TrayIconLayoutEnlargesOnlyIdleGlyph()
{
    var canvas = new Size(32, 32);

    AssertEqual(
        new Rectangle(-1, -1, 34, 34),
        TrayIconLayout.RenderBounds(isPlaying: false, canvas)
    );
    AssertEqual(
        new Rectangle(Point.Empty, canvas),
        TrayIconLayout.RenderBounds(isPlaying: true, canvas)
    );

    return Task.CompletedTask;
}

static Task ArtworkLayoutPreservesAspectRatios()
{
    var squareBounds = new Rectangle(0, 0, 160, 160);

    AssertEqual(
        new RectangleF(0, 35, 160, 90),
        ArtworkLayout.AspectFit(new Size(16, 9), squareBounds)
    );
    AssertEqual(
        new RectangleF(35, 0, 90, 160),
        ArtworkLayout.AspectFit(new Size(9, 16), squareBounds)
    );
    AssertEqual(
        new RectangleF(squareBounds.X, squareBounds.Y, squareBounds.Width, squareBounds.Height),
        ArtworkLayout.AspectFit(new Size(160, 160), squareBounds)
    );
    AssertEqual(
        RectangleF.Empty,
        ArtworkLayout.AspectFit(Size.Empty, squareBounds)
    );
    AssertEqual(
        RectangleF.Empty,
        ArtworkLayout.AspectFit(new Size(16, 9), Rectangle.Empty)
    );

    return Task.CompletedTask;
}

static async Task UpdateServiceFindsNewestTrayRelease()
{
    const string releaseListUrl = "https://example.test/releases";
    const string manifestUrl =
        "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json";
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri == releaseListUrl
            ? JsonResponse(
                """
                [
                  {
                    "tag_name": "windows-tray-v0.1.1",
                    "html_url": "https://example.test/releases/windows-tray-v0.1.1",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                      {
                        "name": "YTM-Tray-update.json",
                        "browser_download_url": "https://example.test/download/windows-tray-v0.1.1/YTM-Tray-update.json"
                      }
                    ]
                  },
                  {
                    "tag_name": "v9.9.9",
                    "html_url": "https://example.test/releases/v9.9.9",
                    "draft": false,
                    "prerelease": false,
                    "assets": []
                  },
                  {
                    "tag_name": "windows-tray-v0.2.0",
                    "html_url": "https://example.test/releases/windows-tray-v0.2.0",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                      {
                        "name": "YTM-Tray-update.json",
                        "browser_download_url": "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json"
                      }
                    ]
                  }
                ]
                """
            )
            : new HttpResponseMessage(HttpStatusCode.NotFound)
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri(releaseListUrl),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();

    AssertEqual(true, update.IsUpdateAvailable);
    AssertEqual("0.2.0", update.LatestVersion);
    AssertEqual(manifestUrl, update.ManifestUrl?.AbsoluteUri);
}

static async Task UpdateServiceIgnoresCurrentTrayRelease()
{
    const string releaseListUrl = "https://example.test/releases";
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri == releaseListUrl
            ? JsonResponse(
                """
                [
                  {
                    "tag_name": "windows-tray-v0.1.0",
                    "html_url": "https://example.test/releases/windows-tray-v0.1.0",
                    "draft": false,
                    "prerelease": false,
                    "assets": [
                      {
                        "name": "YTM-Tray-update.json",
                        "browser_download_url": "https://example.test/download/windows-tray-v0.1.0/YTM-Tray-update.json"
                      }
                    ]
                  }
                ]
                """
            )
            : new HttpResponseMessage(HttpStatusCode.NotFound)
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri(releaseListUrl),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();

    AssertEqual(false, update.IsUpdateAvailable);
    AssertEqual("0.1.0", update.LatestVersion);
}

static Task UpdateSessionClearsStaleAvailabilityAfterFailedRefresh()
{
    var update = new WindowsTrayUpdateCheckResult(
        true,
        "0.1.0",
        "0.2.0",
        "windows-tray-v0.2.0",
        new Uri("https://example.com/release"),
        new Uri("https://example.com/update.json")
    );
    var session = new WindowsTrayUpdateSession();

    AssertEqual(true, session.TryBeginCheck(reuseAvailableUpdate: false, out var cached));
    AssertEqual<WindowsTrayUpdateCheckResult?>(null, cached);
    session.ApplyResult(update);
    session.CompleteCheck();
    AssertEqual(WindowsTrayUpdatePhase.UpdateAvailable, session.Phase);
    AssertEqual(true, session.HasUpdateAvailable);

    AssertEqual(true, session.TryBeginCheck(reuseAvailableUpdate: false, out cached));
    AssertEqual<WindowsTrayUpdateCheckResult?>(null, cached);
    AssertEqual(WindowsTrayUpdatePhase.Checking, session.Phase);
    AssertEqual(false, session.HasUpdateAvailable);

    session.Fail("network unavailable");
    session.CompleteCheck();
    AssertEqual(WindowsTrayUpdatePhase.Failed, session.Phase);
    AssertEqual("network unavailable", session.Error);
    AssertEqual(false, session.HasUpdateAvailable);
    AssertEqual<WindowsTrayUpdateCheckResult?>(null, session.AvailableUpdate);

    AssertEqual(true, session.TryBeginCheck(reuseAvailableUpdate: true, out cached));
    AssertEqual<WindowsTrayUpdateCheckResult?>(null, cached);
    session.CompleteCheck();

    return Task.CompletedTask;
}

static Task UpdateSessionReusesAvailabilityOnlyForInstallAction()
{
    var update = new WindowsTrayUpdateCheckResult(
        true,
        "0.1.0",
        "0.2.0",
        "windows-tray-v0.2.0",
        new Uri("https://example.com/release"),
        new Uri("https://example.com/update.json")
    );
    var session = new WindowsTrayUpdateSession();

    AssertEqual(true, session.TryBeginCheck(reuseAvailableUpdate: false, out _));
    session.ApplyResult(update);
    session.CompleteCheck();

    AssertEqual(true, session.TryBeginCheck(reuseAvailableUpdate: true, out var cached));
    AssertEqual(update, cached);
    AssertEqual(WindowsTrayUpdatePhase.Checking, session.Phase);
    AssertEqual(false, session.HasUpdateAvailable);

    session.ApplyResult(cached!);
    session.BeginDownload();
    AssertEqual(WindowsTrayUpdatePhase.Downloading, session.Phase);
    AssertEqual(true, session.HasUpdateAvailable);
    session.CompleteCheck();

    return Task.CompletedTask;
}

static Task UpdateOptionsUsePackagedReleaseVersion()
{
    using var temp = new TempDirectory();
    File.WriteAllText(
        Path.Combine(temp.Path, "release.json"),
        """
        {
          "releaseListUrl": "https://example.test/releases",
          "githubReleaseTagPrefix": "windows-tray-v",
          "runtimeIdentifier": "win-arm64",
          "updateManifestAssetName": "YTM-Tray-update.json",
          "version": "0.0.2"
        }
        """
    );

    var options = WindowsTrayUpdateOptions.FromReleaseMetadataFile(temp.Path);

    AssertNotNull(options, "packaged release options");
    AssertEqual("0.0.2", options!.CurrentVersion);
    AssertEqual("win-arm64", options.RuntimeIdentifier);
    return Task.CompletedTask;
}

static async Task UpdateServicePreparesVerifiedPackage()
{
    using var temp = new TempDirectory();
    var packageBytes = CreatePackageBytes(
        ("YTMTray.Setup.exe", "setup"),
        ("YTMTray.exe", "tray"),
        ("YTMTray.NativeHost.exe", "native-host")
    );
    var checksum = Sha256(packageBytes);
    var manifest = UpdateManifestJson(checksum);
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri switch
        {
            "https://example.test/releases" => ReleasesResponse(),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json" =>
                JsonResponse(manifest),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip" =>
                BytesResponse(packageBytes),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        }
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri("https://example.test/releases"),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();
    var prepared = await service.DownloadAndPrepareUpdateAsync(update, temp.Path);

    AssertEqual("0.2.0", prepared.Version);
    AssertEqual(true, File.Exists(prepared.PackagePath));
    AssertEqual(true, File.Exists(prepared.InstallerExecutablePath));
    AssertEqual(
        "YTMTray.Setup.exe",
        Path.GetFileName(prepared.InstallerExecutablePath)
    );
}

static Task UpdateServiceLaunchesNativeSetupDirectly()
{
    using var temp = new TempDirectory();
    var extractDirectory = Path.Combine(temp.Path, "payload");
    var installRoot = Path.Combine(temp.Path, "installed");
    var setupPath = Path.Combine(extractDirectory, "YTMTray.Setup.exe");
    var logPath = Path.Combine(extractDirectory, "update-installer.log");
    Directory.CreateDirectory(extractDirectory);
    File.WriteAllText(setupPath, "setup");
    var prepared = new PreparedWindowsTrayUpdate(
        "0.2.0",
        "win-x64",
        Path.Combine(temp.Path, "package.zip"),
        extractDirectory,
        setupPath
    );

    var startInfo = WindowsTrayUpdateService.CreateInstallerStartInfo(
        1234,
        installRoot,
        prepared,
        logPath
    );
    var arguments = startInfo.ArgumentList.ToArray();

    AssertEqual(setupPath, startInfo.FileName);
    AssertEqual(false, startInfo.UseShellExecute);
    AssertEqual(extractDirectory, startInfo.WorkingDirectory);
    AssertEqual(true, arguments.Contains("install"));
    AssertEqual(true, arguments.Contains("--quiet"));
    AssertEqual(true, arguments.Contains("--launch-after-install"));
    AssertEqual(true, arguments.Contains("--wait-for-process"));
    AssertEqual(true, arguments.Contains("1234"));
    AssertEqual(true, arguments.Contains("--install-root"));
    AssertEqual(true, arguments.Contains(installRoot));
    AssertEqual(true, arguments.Contains("--log-path"));
    AssertEqual(true, arguments.Contains(logPath));
    AssertEqual(false, startInfo.FileName.Contains("powershell", StringComparison.OrdinalIgnoreCase));
    AssertEqual(
        false,
        arguments.Any(argument =>
            argument.Contains("powershell", StringComparison.OrdinalIgnoreCase)
            || argument.Contains("cmd.exe", StringComparison.OrdinalIgnoreCase)
        )
    );
    return Task.CompletedTask;
}

static Task PostInstallLaunchPolicyHandlesUserAndUpdaterFlows()
{
    AssertEqual(
        true,
        WindowsTrayAppLaunch.ShouldLaunchAfterInstall(
            quiet: false,
            launchAfterInstallRequested: false,
            waitForProcessRequested: false
        )
    );
    AssertEqual(
        false,
        WindowsTrayAppLaunch.ShouldLaunchAfterInstall(
            quiet: true,
            launchAfterInstallRequested: false,
            waitForProcessRequested: false
        )
    );
    AssertEqual(
        true,
        WindowsTrayAppLaunch.ShouldLaunchAfterInstall(
            quiet: true,
            launchAfterInstallRequested: true,
            waitForProcessRequested: false
        )
    );
    AssertEqual(
        true,
        WindowsTrayAppLaunch.ShouldLaunchAfterInstall(
            quiet: true,
            launchAfterInstallRequested: false,
            waitForProcessRequested: true
        )
    );
    return Task.CompletedTask;
}

static Task PostInstallLaunchTargetsInstalledTrayApp()
{
    using var temp = new TempDirectory();
    var startInfo = WindowsTrayAppLaunch.CreateStartInfo(temp.Path);

    AssertEqual(
        Path.Combine(temp.Path, "YTMTray.exe"),
        startInfo.FileName
    );
    AssertEqual(temp.Path, startInfo.WorkingDirectory);
    AssertEqual(false, startInfo.UseShellExecute);
    return Task.CompletedTask;
}

static async Task UpdateServiceRejectsMissingNativeSetup()
{
    using var temp = new TempDirectory();
    var packageBytes = CreatePackageBytes(
        ("install-native-hosts.ps1", "Write-Output legacy"),
        ("YTMTray.exe", "tray"),
        ("YTMTray.NativeHost.exe", "native-host")
    );
    var checksum = Sha256(packageBytes);
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri switch
        {
            "https://example.test/releases" => ReleasesResponse(),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json" =>
                JsonResponse(UpdateManifestJson(checksum)),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip" =>
                BytesResponse(packageBytes),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        }
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri("https://example.test/releases"),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();
    await AssertThrowsAsync<InvalidDataException>(
        () => service.DownloadAndPrepareUpdateAsync(update, temp.Path),
        "missing YTMTray.Setup.exe"
    );
}

static async Task UpdateServiceRejectsUnsafePackageEntries()
{
    using var temp = new TempDirectory();
    var packageBytes = CreatePackageBytes(
        ("install-native-hosts.ps1", "Write-Output installed"),
        ("../escape.txt", "unsafe")
    );
    var checksum = Sha256(packageBytes);
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri switch
        {
            "https://example.test/releases" => ReleasesResponse(),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json" =>
                JsonResponse(UpdateManifestJson(checksum)),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip" =>
                BytesResponse(packageBytes),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        }
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri("https://example.test/releases"),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();
    await AssertThrowsAsync<InvalidDataException>(
        () => service.DownloadAndPrepareUpdateAsync(update, temp.Path),
        "unsafe package path"
    );
}

static async Task UpdateServiceRejectsUnsafePackageNames()
{
    using var temp = new TempDirectory();
    var packageBytes = CreatePackageBytes(
        ("YTMTray.Setup.exe", "setup"),
        ("YTMTray.exe", "tray"),
        ("YTMTray.NativeHost.exe", "native-host")
    );
    var checksum = Sha256(packageBytes);
    const string unsafeAssetName = "../escaped-package.zip";
    using var http = new HttpClient(new FakeHttpHandler(request =>
        request.RequestUri?.AbsoluteUri switch
        {
            "https://example.test/releases" => ReleasesResponse(),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json" =>
                JsonResponse(UpdateManifestJson(checksum, unsafeAssetName)),
            "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip" =>
                BytesResponse(packageBytes),
            _ => new HttpResponseMessage(HttpStatusCode.NotFound)
        }
    ));
    var service = new WindowsTrayUpdateService(
        http,
        new WindowsTrayUpdateOptions(
            new Uri("https://example.test/releases"),
            "windows-tray-v",
            "0.1.0",
            "win-x64"
        )
    );

    var update = await service.CheckForUpdateAsync();
    await AssertThrowsAsync<InvalidDataException>(
        () => service.DownloadAndPrepareUpdateAsync(update, temp.Path),
        "unsafe package name"
    );
    AssertEqual(false, File.Exists(Path.Combine(temp.Path, "escaped-package.zip")));
}

static HttpResponseMessage ReleasesResponse() =>
    JsonResponse(
        """
        [
          {
            "tag_name": "windows-tray-v0.2.0",
            "html_url": "https://example.test/releases/windows-tray-v0.2.0",
            "draft": false,
            "prerelease": false,
            "assets": [
              {
                "name": "YTM-Tray-update.json",
                "browser_download_url": "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-update.json"
              }
            ]
          }
        ]
        """
    );

static string UpdateManifestJson(
    string checksum,
    string assetName = "YTM-Tray-0.2.0-win-x64.zip"
) =>
    $$"""
    {
      "schemaVersion": 1,
      "product": "windows-tray",
      "name": "YTM Tray",
      "version": "0.2.0",
      "buildNumber": 2000,
      "tag": "windows-tray-v0.2.0",
      "releaseUrl": "https://example.test/releases/windows-tray-v0.2.0",
      "installUrl": "https://example.test/releases?q=windows-tray-v&expanded=true",
      "releaseListUrl": "https://example.test/releases",
      "minimumWindowsVersion": "Windows 11",
      "assets": {
        "win-x64": {
          "name": "{{assetName}}",
          "sha256": "{{checksum}}",
          "size": 0,
          "url": "https://example.test/download/windows-tray-v0.2.0/YTM-Tray-0.2.0-win-x64.zip"
        }
      }
    }
    """;

static byte[] CreatePackageBytes(params (string Name, string Content)[] entries)
{
    using var stream = new MemoryStream();
    using (var archive = new ZipArchive(stream, ZipArchiveMode.Create, true))
    {
        foreach (var entry in entries)
        {
            var archiveEntry = archive.CreateEntry(entry.Name);
            using var writer = new StreamWriter(archiveEntry.Open(), Encoding.UTF8);
            writer.Write(entry.Content);
        }
    }

    return stream.ToArray();
}

static string Sha256(byte[] bytes) =>
    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

static HttpResponseMessage JsonResponse(string json) =>
    new(HttpStatusCode.OK)
    {
        Content = new StringContent(json, Encoding.UTF8, "application/json")
    };

static HttpResponseMessage BytesResponse(byte[] bytes) =>
    new(HttpStatusCode.OK)
    {
        Content = new ByteArrayContent(bytes)
    };

static void AssertEqual<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new InvalidOperationException($"expected {expected}, got {actual}");
    }
}

static void AssertContains<T>(T expected, IEnumerable<T> values)
{
    if (!values.Contains(expected))
    {
        throw new InvalidOperationException($"expected collection to contain {expected}");
    }
}

static void AssertNotNull(object? value, string label)
{
    if (value is null)
    {
        throw new InvalidOperationException($"{label} was null");
    }
}

static void AssertThrows<T>(Action action, string expectedMessage)
    where T : Exception
{
    try
    {
        action();
    }
    catch (T error)
        when (error.Message.Contains(
            expectedMessage,
            StringComparison.OrdinalIgnoreCase
        ))
    {
        return;
    }

    throw new InvalidOperationException(
        $"expected {typeof(T).Name} containing {expectedMessage}"
    );
}

static async Task AssertThrowsAsync<T>(Func<Task> action, string expectedMessage)
    where T : Exception
{
    try
    {
        await action();
    }
    catch (T error) when (error.Message.Contains(expectedMessage, StringComparison.OrdinalIgnoreCase))
    {
        return;
    }

    throw new InvalidOperationException($"expected {typeof(T).Name} containing {expectedMessage}");
}

static async Task WaitUntilAsync(Func<bool> condition, TimeSpan timeout)
{
    var deadline = DateTime.UtcNow + timeout;
    while (!condition())
    {
        if (DateTime.UtcNow >= deadline)
        {
            throw new TimeoutException("condition was not met before timeout");
        }
        await Task.Delay(5);
    }
}

sealed class FakeConnection : IConnectorConnection
{
    private Action<HostMessage>? onMessage;
    private Action? onDisconnect;
    public List<object> SentMessages { get; } = [];

    public void Start(Action<HostMessage> onMessage, Action onDisconnect)
    {
        this.onMessage = onMessage;
        this.onDisconnect = onDisconnect;
    }

    public Task SendAsync(object message, CancellationToken cancellationToken = default)
    {
        SentMessages.Add(message);
        return Task.CompletedTask;
    }

    public void Emit(HostMessage message) => onMessage?.Invoke(message);
    public void Disconnect() => onDisconnect?.Invoke();

    public string MessageTypeAt(int index)
    {
        var json = JsonSerializer.SerializeToElement(
            SentMessages[index],
            JsonSettings.Options
        );
        return json.GetProperty("type").GetString() ?? "";
    }

    public void Stop() { }
    public void Dispose() { }
}

sealed class FakeTrayController : ITrayController
{
    public Action? OnShuffle { get; set; }
    public Action? OnPrevious { get; set; }
    public Action? OnTogglePlay { get; set; }
    public Action? OnNext { get; set; }
    public Action? OnRepeat { get; set; }
    public Action<double>? OnSeek { get; set; }
    public Action? OnFocusYouTubeMusic { get; set; }
    public string? Status { get; private set; }
    public ConnectorSource? BrowserSource { get; private set; }
    public PlaybackState? State { get; private set; }
    public bool UninstallRequested { get; private set; }
    public int StaleCount { get; private set; }
    public int UpdateCount { get; private set; }
    public bool? YouTubeMusicTabAvailable { get; private set; }

    public void UpdateConnectionStatus(string status) => Status = status;
    public void UpdateBrowserSource(ConnectorSource? source) => BrowserSource = source;
    public void RequestUninstall() => UninstallRequested = true;
    public void UpdateYouTubeMusicTabAvailability(bool available) =>
        YouTubeMusicTabAvailable = available;
    public void SetStalePlaybackState()
    {
        StaleCount += 1;
        Status = "Waiting for playback updates...";
    }
    public void UpdatePlayback(PlaybackState state)
    {
        State = state;
        UpdateCount += 1;
    }
}

sealed class ManualTimeProvider : TimeProvider
{
    private DateTimeOffset now = DateTimeOffset.UnixEpoch;

    public override DateTimeOffset GetUtcNow() => now;

    public void Advance(TimeSpan duration) => now += duration;
}

sealed class FakeHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> respond) : HttpMessageHandler
{
    protected override Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken
    ) => Task.FromResult(respond(request));
}

sealed class TempDirectory : IDisposable
{
    public string Path { get; } = System.IO.Path.Combine(
        System.IO.Path.GetTempPath(),
        $"ytm-tray-test-{Guid.NewGuid():N}"
    );

    public TempDirectory()
    {
        Directory.CreateDirectory(Path);
    }

    public void Dispose()
    {
        Directory.Delete(Path, recursive: true);
    }
}
