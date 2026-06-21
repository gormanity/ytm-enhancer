package cli

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"time"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/connector"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/ipc"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/protocol"
)

const requestTimeout = 6 * time.Second

type App struct {
	Stdout io.Writer
	Stderr io.Writer
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
		return app.watch()
	case "doctor":
		return app.doctor()
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

func (app App) watch() int {
	var previous string
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
		line := watchLine(state)
		if line != previous {
			app.printf("%s\n", line)
			previous = line
		}
		time.Sleep(time.Second)
	}
}

func (app App) doctor() int {
	response, err := app.request(ipc.Request{Command: "doctor"})
	if err != nil {
		app.printf("YTM Enhancer CLI native host: not running\n")
		app.printf("Detail: %s\n", err)
		app.printf("Enable Connected Apps in YTM Enhancer, then reopen the extension popup to start the CLI host.\n")
		return 1
	}
	if !response.OK {
		app.errorf(response.Error)
		return 1
	}

	app.printf("YTM Enhancer CLI native host: running\n")
	app.printf("Connector ID: %s\n", stringValue(response.Data["connectorId"]))
	app.printf("Native host: %s\n", stringValue(response.Data["hostName"]))
	app.printf("Ready: %t\n", boolValue(response.Data["ready"]))
	if lastError := stringValue(response.Data["lastError"]); lastError != "" {
		app.printf("Last error: %s\n", lastError)
	}
	app.printf("Playback state cached: %t\n", boolValue(response.Data["hasState"]))
	return 0
}

func (app App) request(request ipc.Request) (ipc.Response, error) {
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

func (app App) printConnectionError(err error) {
	app.errorf("YTM Enhancer CLI is not connected: %s", err)
	app.errorf("Enable Connected Apps in YTM Enhancer and make sure the CLI app is enabled.")
}

func (app App) printUsage() {
	app.printf(`Usage:
  ytme status [--json]
  ytme now [--json]
  ytme play|pause|toggle|next|prev|previous
  ytme seek <time|+seconds|-seconds>
  ytme shuffle|repeat
  ytme focus
  ytme watch
  ytme doctor
`)
}

func (app App) printf(format string, args ...any) {
	_, _ = fmt.Fprintf(app.Stdout, format, args...)
}

func (app App) errorf(format string, args ...any) {
	_, _ = fmt.Fprintf(app.Stderr, format+"\n", args...)
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
	return fmt.Sprintf("%s %s %s/%s", status, nowLine(state), formatDuration(state.Progress), formatDuration(state.Duration))
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

func stringValue(value any) string {
	if text, ok := value.(string); ok {
		return text
	}
	return ""
}

func boolValue(value any) bool {
	if boolean, ok := value.(bool); ok {
		return boolean
	}
	return false
}
