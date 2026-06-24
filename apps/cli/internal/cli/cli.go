package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"strconv"
	"time"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/connector"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/ipc"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/protocol"
)

const requestTimeout = 6 * time.Second

const (
	ansiGreen  = "\x1b[32m"
	ansiYellow = "\x1b[33m"
	ansiCyan   = "\x1b[36m"
	ansiRed    = "\x1b[31m"
	ansiReset  = "\x1b[0m"
)

type App struct {
	Stdout     io.Writer
	Stderr     io.Writer
	Request    func(ipc.Request) (ipc.Response, error)
	Sleep      func(time.Duration)
	LiveOutput *bool
}

type watchOptions struct {
	jsonOutput bool
	lineOutput bool
	interval   time.Duration
	count      int
}

func (app App) Run(args []string) int {
	if app.Stdout == nil {
		app.Stdout = os.Stdout
	}
	if app.Stderr == nil {
		app.Stderr = os.Stderr
	}
	if len(args) == 0 {
		app.printUsage()
		return 2
	}

	switch args[0] {
	case "status":
		jsonOutput := hasFlag(args[1:], "--json")
		return app.printStatus("status", jsonOutput)
	case "now":
		jsonOutput := hasFlag(args[1:], "--json")
		return app.printStatus("now", jsonOutput)
	case "play":
		return app.action("play")
	case "pause":
		return app.action("pause")
	case "toggle":
		return app.action("togglePlay")
	case "next":
		return app.action("next")
	case "prev", "previous":
		return app.action("previous")
	case "shuffle":
		return app.action("shuffle")
	case "repeat":
		return app.action("repeat")
	case "seek":
		if len(args) < 2 {
			app.errorf("seek requires a target, such as 1:23, +10, or -5")
			return 2
		}
		return app.seek(args[1])
	case "focus":
		return app.simple("focus", nil)
	case "watch":
		if hasHelpFlag(args[1:]) {
			app.printWatchUsage()
			return 0
		}
		options, err := parseWatchOptions(args[1:])
		if err != nil {
			app.errorf(err.Error())
			app.printWatchUsage()
			return 2
		}
		return app.watch(options)
	case "doctor":
		return app.doctor(hasFlag(args[1:], "--verbose"))
	case "daemon":
		return app.daemon(args[1:])
	case "version", "--version":
		app.printVersion()
		return 0
	case "help", "--help", "-h":
		app.printUsage()
		return 0
	default:
		app.errorf("unknown command: %s", args[0])
		app.printUsage()
		return 2
	}
}

func (app App) printStatus(command string, jsonOutput bool) int {
	response, err := app.request(ipc.Request{Command: "status"})
	if err != nil {
		app.printConnectionError(err)
		return 1
	}
	if !response.OK {
		app.errorf(response.Error)
		return 1
	}
	if jsonOutput {
		return app.printJSON(response.Data)
	}

	state, err := stateFromResponse(response)
	if err != nil {
		app.errorf(err.Error())
		return 1
	}
	if command == "now" {
		app.printf("%s\n", nowLine(state))
		return 0
	}
	app.printHumanStatus(state)
	return 0
}

func (app App) action(action string) int {
	return app.simple("action", map[string]any{"action": action})
}

func (app App) seek(value string) int {
	args, err := connector.ParseSeek(value)
	if err != nil {
		app.errorf(err.Error())
		return 2
	}
	return app.simple("seek", args)
}

func (app App) simple(command string, args map[string]any) int {
	response, err := app.request(ipc.Request{Command: command, Args: args})
	if err != nil {
		app.printConnectionError(err)
		return 1
	}
	if !response.OK {
		app.errorf(response.Error)
		return 1
	}
	if response.Message != "" && response.Message != "ok" {
		app.printf("%s\n", response.Message)
	}
	return 0
}

func (app App) watch(options watchOptions) int {
	var previous string
	emitted := 0
	liveOutput := !options.jsonOutput && !options.lineOutput && app.shouldUseLiveOutput()
	liveLines := 0
	for {
		response, err := app.request(ipc.Request{Command: "status"})
		if err != nil {
			app.printConnectionError(err)
			return 1
		}
		if !response.OK {
			app.errorf(response.Error)
			return 1
		}
		state, err := stateFromResponse(response)
		if err != nil {
			app.errorf(err.Error())
			return 1
		}
		if liveOutput {
			liveLines = app.printLiveWatchFrame(state, liveLines)
			emitted++
			if options.count > 0 && emitted >= options.count {
				return 0
			}
		} else {
			key := watchKey(state)
			if key != previous {
				if options.jsonOutput {
					if app.printCompactJSON(state) != 0 {
						return 1
					}
				} else {
					app.printf("%s\n", watchLine(state))
				}
				previous = key
				emitted++
				if options.count > 0 && emitted >= options.count {
					return 0
				}
			}
		}
		app.sleep(options.interval)
	}
}

func (app App) printLiveWatchFrame(state *protocol.PlaybackState, previousLines int) int {
	lines := liveWatchLines(state)
	if previousLines > 0 {
		app.printf("\x1b[%dF", previousLines)
	}
	for _, line := range lines {
		app.printf("\x1b[2K%s\n", line)
	}
	return len(lines)
}

func liveWatchLines(state *protocol.PlaybackState) []string {
	status := ">"
	if !state.IsPlaying {
		status = "||"
	}
	return []string{
		fmt.Sprintf("%s %s", status, nowLine(state)),
		fmt.Sprintf("[%s] %s / %s", progressBar(state.Progress, state.Duration, 24), formatDuration(state.Progress), formatDuration(state.Duration)),
	}
}

func progressBar(progress float64, duration float64, width int) string {
	if width <= 0 {
		return ""
	}
	filled := 0
	if duration > 0 && !math.IsNaN(progress) && !math.IsInf(progress, 0) {
		ratio := progress / duration
		if ratio < 0 {
			ratio = 0
		}
		if ratio > 1 {
			ratio = 1
		}
		filled = int(math.Round(ratio * float64(width)))
	}
	bar := make([]byte, width)
	for index := range bar {
		if index < filled {
			bar[index] = '#'
		} else {
			bar[index] = '-'
		}
	}
	return string(bar)
}

func (app App) doctor(verbose bool) int {
	response, err := app.request(ipc.Request{Command: "doctor"})
	if err != nil {
		app.printf("YTM Enhancer CLI Doctor\n")
		app.printDoctorLine("WARN  Connector: not connected to YTM Enhancer")
		app.printDoctorLine(fmt.Sprintf("OK    Versions: CLI %s", protocol.ConnectorVersion))
		app.printDoctorLine("INFO  Next: Open YTM Enhancer > Connected Apps and make sure the CLI is enabled")
		if verbose {
			app.printf("Detail: %s\n", err)
		}
		return 1
	}
	if !response.OK {
		app.errorf(response.Error)
		return 1
	}

	app.printf("YTM Enhancer CLI Doctor\n")
	app.printDoctorLine(connectorStatusLine(response.Data))
	app.printDoctorLine(ytmTabStatusLine(response.Data))
	app.printDoctorLine(playbackCacheLine(response.Data["hasState"]))
	app.printDoctorLine(versionStatusLine(response.Data))
	lastError := stringValue(response.Data["lastError"])
	printedLastError := false
	if lastError != "" && !boolValue(response.Data["ready"]) {
		app.printDoctorLine(fmt.Sprintf("ERROR Last error: %s", lastError))
		printedLastError = true
	}
	if !verbose {
		return 0
	}

	app.printf("Connector ID: %s\n", stringValue(response.Data["connectorId"]))
	app.printf("Native host: %s\n", stringValue(response.Data["hostName"]))
	app.printf("Ready: %t\n", boolValue(response.Data["ready"]))
	if activeProtocol := stringValue(response.Data["activeProtocolVersion"]); activeProtocol != "" {
		app.printf("Active protocol: %s\n", activeProtocol)
	}
	if lastError != "" && !printedLastError {
		app.printf("Last error: %s\n", lastError)
	}
	if tabStatusError := stringValue(response.Data["ytmTabStatusError"]); tabStatusError != "" {
		app.printf("YTM tab status error: %s\n", tabStatusError)
	}
	return 0
}

func (app App) daemon(args []string) int {
	if len(args) == 0 {
		app.errorf("daemon requires a subcommand")
		app.printDaemonUsage()
		return 2
	}

	switch args[0] {
	case "status":
		return app.doctor(hasFlag(args[1:], "--verbose"))
	case "start":
		return app.daemonStart()
	case "stop":
		return app.simple("daemon.stop", nil)
	case "help", "--help", "-h":
		app.printDaemonUsage()
		return 0
	default:
		app.errorf("unknown daemon subcommand: %s", args[0])
		app.printDaemonUsage()
		return 2
	}
}

func (app App) daemonStart() int {
	response, err := app.request(ipc.Request{Command: "daemon.status"})
	if err != nil {
		app.printf("YTM Enhancer CLI daemon is not running.\n")
		app.printf("The browser extension starts the daemon through native messaging.\n")
		app.printf("Open YTM Enhancer > Connected Apps, make sure Connected Apps and YTM Enhancer CLI are enabled, then use Reconnect CLI if it appears.\n")
		return 1
	}
	if !response.OK {
		app.errorf(response.Error)
		return 1
	}

	app.printf("YTM Enhancer CLI daemon is already running.\n")
	return 0
}

func (app App) request(request ipc.Request) (ipc.Response, error) {
	if app.Request != nil {
		return app.Request(request)
	}
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()
	return ipc.Send(ctx, request)
}

func (app App) printHumanStatus(state *protocol.PlaybackState) {
	status := "Paused"
	if state.IsPlaying {
		status = "Playing"
	}
	app.printf("%s: %s\n", status, nowLine(state))
	if state.Album != nil && *state.Album != "" {
		app.printf("Album: %s\n", *state.Album)
	}
	if state.Year != nil {
		app.printf("Year: %d\n", *state.Year)
	}
	app.printf("Progress: %s / %s\n", formatDuration(state.Progress), formatDuration(state.Duration))
	if state.IsShuffling != nil {
		app.printf("Shuffle: %s\n", onOff(*state.IsShuffling))
	}
	if state.RepeatMode != nil {
		app.printf("Repeat: %s\n", *state.RepeatMode)
	}
	if state.NextTrack != nil {
		app.printf("Up next: %s\n", trackLine(state.NextTrack.Title, state.NextTrack.Artist))
	}
}

func (app App) printJSON(value any) int {
	encoder := json.NewEncoder(app.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		app.errorf(err.Error())
		return 1
	}
	return 0
}

func (app App) printCompactJSON(value any) int {
	encoder := json.NewEncoder(app.Stdout)
	if err := encoder.Encode(value); err != nil {
		app.errorf(err.Error())
		return 1
	}
	return 0
}

func (app App) printConnectionError(err error) {
	app.errorf("YTM Enhancer CLI is not connected: %s", err)
	app.errorf("Enable Connected Apps in YTM Enhancer and make sure the CLI app is enabled.")
}

func (app App) printUsage() {
	app.printf(`Usage:
  ytme help
  ytme --version
  ytme status [--json]
  ytme now [--json]
  ytme play|pause|toggle|next|prev|previous
  ytme seek <time|+seconds|-seconds>
  ytme shuffle|repeat
  ytme focus
  ytme watch [--json|--lines] [--interval <duration>] [--count <n>]
  ytme doctor [--verbose]
  ytme daemon status [--verbose]|start|stop
`)
}

func (app App) printVersion() {
	app.printf("ytme %s\n", protocol.ConnectorVersion)
}

func (app App) printDaemonUsage() {
	app.printf(`Usage:
  ytme daemon status
  ytme daemon status --verbose
  ytme daemon start
  ytme daemon stop
`)
}

func (app App) printWatchUsage() {
	app.printf(`Usage:
  ytme watch [--json|--lines] [--interval <duration>] [--count <n>]

Options:
  --lines                Print a line for each meaningful playback change.
  --json                 Emit compact newline-delimited JSON playback states.
  --interval <duration>  Poll interval such as 500ms, 1s, or 2s.
  --count <n>            Stop after rendering or emitting n updates.
`)
}

func (app App) printf(format string, args ...any) {
	_, _ = fmt.Fprintf(app.Stdout, format, args...)
}

func (app App) errorf(format string, args ...any) {
	_, _ = fmt.Fprintf(app.Stderr, format+"\n", args...)
}

func (app App) printDoctorLine(line string) {
	app.printf("%s\n", colorizeStatusLine(line, app.shouldUseColor()))
}

func (app App) sleep(duration time.Duration) {
	if app.Sleep != nil {
		app.Sleep(duration)
		return
	}
	time.Sleep(duration)
}

func (app App) shouldUseColor() bool {
	if os.Getenv("NO_COLOR") != "" {
		return false
	}
	if os.Getenv("FORCE_COLOR") != "" {
		return true
	}

	return app.stdoutIsTerminal()
}

func (app App) shouldUseLiveOutput() bool {
	if app.LiveOutput != nil {
		return *app.LiveOutput
	}
	return app.stdoutIsTerminal() && os.Getenv("TERM") != "dumb"
}

func (app App) stdoutIsTerminal() bool {
	file, ok := app.Stdout.(*os.File)
	if !ok {
		return false
	}
	stat, err := file.Stat()
	if err != nil {
		return false
	}
	return stat.Mode()&os.ModeCharDevice != 0
}

func stateFromResponse(response ipc.Response) (*protocol.PlaybackState, error) {
	if response.Data == nil {
		return nil, errors.New("response did not include playback state")
	}
	rawState, ok := response.Data["state"]
	if !ok {
		return nil, errors.New("response did not include playback state")
	}
	return connector.DecodeState(rawState)
}

func nowLine(state *protocol.PlaybackState) string {
	return trackLine(state.Title, state.Artist)
}

func watchLine(state *protocol.PlaybackState) string {
	status := "paused"
	if state.IsPlaying {
		status = "playing"
	}
	return fmt.Sprintf("%s %s", status, nowLine(state))
}

func watchKey(state *protocol.PlaybackState) string {
	snapshot := map[string]any{
		"title":       stringPointerValue(state.Title),
		"artist":      stringPointerValue(state.Artist),
		"album":       stringPointerValue(state.Album),
		"year":        intPointerValue(state.Year),
		"artworkUrl":  stringPointerValue(state.ArtworkURL),
		"nextTrack":   trackKey(state.NextTrack),
		"isPlaying":   state.IsPlaying,
		"duration":    formatDuration(state.Duration),
		"isShuffling": optionalBoolPointerValue(state.IsShuffling),
		"repeatMode":  stringPointerValue(state.RepeatMode),
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil {
		return watchLine(state)
	}
	return string(encoded)
}

func trackKey(track *protocol.TrackMetadata) map[string]any {
	if track == nil {
		return nil
	}
	return map[string]any{
		"title":      stringPointerValue(track.Title),
		"artist":     stringPointerValue(track.Artist),
		"album":      stringPointerValue(track.Album),
		"year":       intPointerValue(track.Year),
		"artworkUrl": stringPointerValue(track.ArtworkURL),
	}
}

func trackLine(title *string, artist *string) string {
	titleValue := "Unknown track"
	if title != nil && *title != "" {
		titleValue = *title
	}
	if artist != nil && *artist != "" {
		return fmt.Sprintf("%s - %s", titleValue, *artist)
	}
	return titleValue
}

func formatDuration(seconds float64) string {
	if seconds <= 0 || math.IsNaN(seconds) || math.IsInf(seconds, 0) {
		return "0:00"
	}
	total := int(math.Round(seconds))
	minutes := total / 60
	remaining := total % 60
	return fmt.Sprintf("%d:%02d", minutes, remaining)
}

func onOff(value bool) string {
	if value {
		return "on"
	}
	return "off"
}

func hasFlag(args []string, flag string) bool {
	for _, arg := range args {
		if arg == flag {
			return true
		}
	}
	return false
}

func hasHelpFlag(args []string) bool {
	return hasFlag(args, "help") || hasFlag(args, "--help") || hasFlag(args, "-h")
}

func parseWatchOptions(args []string) (watchOptions, error) {
	options := watchOptions{
		interval: time.Second,
	}
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--json":
			options.jsonOutput = true
		case "--lines":
			options.lineOutput = true
		case "--interval":
			i++
			if i >= len(args) {
				return options, errors.New("watch --interval requires a duration")
			}
			interval, err := time.ParseDuration(args[i])
			if err != nil || interval <= 0 {
				return options, errors.New("watch --interval must be a positive duration such as 500ms, 1s, or 2s")
			}
			options.interval = interval
		case "--count":
			i++
			if i >= len(args) {
				return options, errors.New("watch --count requires a number")
			}
			count, err := strconv.Atoi(args[i])
			if err != nil || count <= 0 {
				return options, errors.New("watch --count must be a positive number")
			}
			options.count = count
		default:
			return options, fmt.Errorf("unknown watch option: %s", args[i])
		}
	}
	if options.jsonOutput && options.lineOutput {
		return options, errors.New("watch accepts only one of --json or --lines")
	}
	return options, nil
}

func stringValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func stringPointerValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func intPointerValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func optionalBoolPointerValue(value *bool) string {
	if value == nil {
		return ""
	}
	if *value {
		return "true"
	}
	return "false"
}

func boolValue(value any) bool {
	if boolean, ok := value.(bool); ok {
		return boolean
	}
	return false
}

func optionalBool(value any) (bool, bool) {
	boolean, ok := value.(bool)
	return boolean, ok
}

func intValue(value any) int {
	switch typed := value.(type) {
	case int:
		return typed
	case int64:
		return int(typed)
	case float64:
		return int(typed)
	default:
		return 0
	}
}

func diagnosticValue(value any) string {
	if text := stringValue(value); text != "" {
		return text
	}
	return "unknown"
}

func colorizeStatusLine(line string, useColor bool) string {
	if !useColor {
		return line
	}

	switch {
	case len(line) >= 2 && line[:2] == "OK":
		return ansiGreen + line[:2] + ansiReset + line[2:]
	case len(line) >= 4 && line[:4] == "WARN":
		return ansiYellow + line[:4] + ansiReset + line[4:]
	case len(line) >= 4 && line[:4] == "INFO":
		return ansiCyan + line[:4] + ansiReset + line[4:]
	case len(line) >= 5 && line[:5] == "ERROR":
		return ansiRed + line[:5] + ansiReset + line[5:]
	default:
		return line
	}
}

func connectorStatusLine(data map[string]any) string {
	if boolValue(data["ready"]) {
		return "OK    Connector: connected to YTM Enhancer"
	}
	return "WARN  Connector: native host is running, but the connector is not ready"
}

func ytmTabStatusLine(data map[string]any) string {
	if stringValue(data["ytmTabStatusError"]) != "" {
		return "WARN  YouTube Music: tab status unavailable; run with --verbose for details"
	}

	detected, ok := optionalBool(data["ytmTabDetected"])
	if !ok {
		return "INFO  YouTube Music: tab status not reported by this daemon"
	}
	if !detected {
		return "WARN  YouTube Music: no tab detected; open or reload music.youtube.com"
	}

	tabCount := intValue(data["ytmTabCount"])
	if tabCount <= 0 {
		return "OK    YouTube Music: detected"
	}

	selected := "no selected tab"
	if boolValue(data["selectedYtmTabKnown"]) {
		selected = "selected tab known"
	}
	return fmt.Sprintf("OK    YouTube Music: detected (%d %s, %s)", tabCount, pluralize("tab", tabCount), selected)
}

func playbackCacheLine(value any) string {
	if boolValue(value) {
		return "OK    Playback: cached state is available"
	}
	return "INFO  Playback: no cached state yet"
}

func versionStatusLine(data map[string]any) string {
	hostVersion := stringValue(data["connectorVersion"])
	protocolVersion := stringValue(data["protocolVersion"])
	if hostVersion == "" || protocolVersion == "" {
		return fmt.Sprintf("INFO  Versions: CLI %s; host/protocol details not reported by this daemon", protocol.ConnectorVersion)
	}

	return fmt.Sprintf(
		"OK    Versions: CLI %s, host %s, protocol %s",
		protocol.ConnectorVersion,
		hostVersion,
		protocolVersion,
	)
}

func pluralize(word string, count int) string {
	if count == 1 {
		return word
	}
	return word + "s"
}
