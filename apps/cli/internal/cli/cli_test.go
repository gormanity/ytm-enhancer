package cli

import (
	"bytes"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/ipc"
)

func TestUnknownCommandPrintsUsage(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{Stdout: &stdout, Stderr: &stderr}.Run([]string{"bogus"})
	if code != 2 {
		t.Fatalf("exit code = %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "unknown command: bogus") {
		t.Fatalf("stderr = %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "ytme status") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestHelpPrintsUsage(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{Stdout: &stdout, Stderr: &stderr}.Run([]string{"help"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	for _, expected := range []string{
		"ytme help",
		"ytme --version",
		"ytme daemon status",
	} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("stdout = %q, missing %q", stdout.String(), expected)
		}
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q, want empty", stderr.String())
	}
}

func TestVersionPrintsCliVersion(t *testing.T) {
	for _, command := range []string{"--version", "version"} {
		t.Run(command, func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			requested := false

			code := App{
				Stdout: &stdout,
				Stderr: &stderr,
				Request: func(request ipc.Request) (ipc.Response, error) {
					requested = true
					return ipc.Response{}, nil
				},
			}.Run([]string{command})
			if code != 0 {
				t.Fatalf("exit code = %d, want 0", code)
			}
			if stdout.String() != "ytme 0.1.0\n" {
				t.Fatalf("stdout = %q, want %q", stdout.String(), "ytme 0.1.0\n")
			}
			if stderr.String() != "" {
				t.Fatalf("stderr = %q, want empty", stderr.String())
			}
			if requested {
				t.Fatalf("version should not contact the daemon")
			}
		})
	}
}

func TestDaemonStartReportsRunningDaemon(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	var command string

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			command = request.Command
			return ipc.Response{OK: true}, nil
		},
	}.Run([]string{"daemon", "start"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	if command != "daemon.status" {
		t.Fatalf("command = %q, want daemon.status", command)
	}
	if !strings.Contains(stdout.String(), "already running") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestDoctorPrintsVersionDiagnostics(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{
				OK: true,
				Data: map[string]any{
					"connectorId":           "com.gormanity.ytm-enhancer.cli",
					"connectorVersion":      "0.1.0",
					"hostName":              "com.gormanity.ytm_enhancer.cli",
					"protocolVersion":       "1.0.0",
					"activeProtocolVersion": "1.0.0",
					"ready":                 true,
					"ytmTabDetected":        true,
					"ytmTabCount":           2,
					"selectedYtmTabKnown":   true,
					"hasState":              true,
				},
			}, nil
		},
	}.Run([]string{"doctor"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	for _, expected := range []string{
		"YTM Enhancer CLI Doctor",
		"OK    Connector: connected to YTM Enhancer",
		"OK    YouTube Music: detected (2 tabs, selected tab known)",
		"OK    Playback: cached state is available",
		"OK    Versions: CLI 0.1.0, host 0.1.0, protocol 1.0.0",
	} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("stdout = %q, missing %q", stdout.String(), expected)
		}
	}
	if strings.Contains(stdout.String(), "Connector ID:") {
		t.Fatalf("stdout = %q, should hide verbose connector details", stdout.String())
	}
}

func TestDoctorPrintsLocalDiagnosticsWhenDaemonIsUnavailable(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{}, errors.New("socket unavailable")
		},
	}.Run([]string{"doctor"})
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	for _, expected := range []string{
		"YTM Enhancer CLI Doctor",
		"WARN  Connector: not connected to YTM Enhancer",
		"OK    Versions: CLI 0.1.0",
		"INFO  Next: Open YTM Enhancer > Connected Apps and make sure the CLI is enabled",
	} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("stdout = %q, missing %q", stdout.String(), expected)
		}
	}
	if strings.Contains(stdout.String(), "Detail:") {
		t.Fatalf("stdout = %q, should hide connection detail without --verbose", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q, want empty", stderr.String())
	}
}

func TestDoctorVerbosePrintsUnavailableDaemonDetail(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{}, errors.New("socket unavailable")
		},
	}.Run([]string{"doctor", "--verbose"})
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if !strings.Contains(stdout.String(), "Detail: socket unavailable") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if stderr.String() != "" {
		t.Fatalf("stderr = %q, want empty", stderr.String())
	}
}

func TestColorizeStatusLineColorsOnlyStatusPrefix(t *testing.T) {
	line := colorizeStatusLine("WARN  YouTube Music: no tab detected", true)
	expected := "\x1b[33mWARN\x1b[0m  YouTube Music: no tab detected"
	if line != expected {
		t.Fatalf("line = %q, want %q", line, expected)
	}
}

func TestColorizeStatusLineLeavesPlainTextWhenDisabled(t *testing.T) {
	line := colorizeStatusLine("OK    Connector: connected to YTM Enhancer", false)
	expected := "OK    Connector: connected to YTM Enhancer"
	if line != expected {
		t.Fatalf("line = %q, want %q", line, expected)
	}
}

func TestDoctorPrintsUnknownForMissingVersionDiagnostics(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{
				OK: true,
				Data: map[string]any{
					"connectorId": "com.gormanity.ytm-enhancer.cli",
					"hostName":    "com.gormanity.ytm_enhancer.cli",
					"ready":       true,
					"hasState":    false,
				},
			}, nil
		},
	}.Run([]string{"doctor"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	for _, expected := range []string{
		"INFO  YouTube Music: tab status not reported by this daemon",
		"INFO  Playback: no cached state yet",
		"INFO  Versions: CLI 0.1.0; host/protocol details not reported by this daemon",
	} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("stdout = %q, missing %q", stdout.String(), expected)
		}
	}
}

func TestDoctorPrintsYtmTabStatusError(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{
				OK: true,
				Data: map[string]any{
					"connectorId":       "com.gormanity.ytm-enhancer.cli",
					"connectorVersion":  "0.1.0",
					"hostName":          "com.gormanity.ytm_enhancer.cli",
					"protocolVersion":   "1.0.0",
					"ready":             true,
					"ytmTabStatusError": "unsupported message type",
					"hasState":          false,
				},
			}, nil
		},
	}.Run([]string{"doctor", "--verbose"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	for _, expected := range []string{
		"WARN  YouTube Music: tab status unavailable; run with --verbose for details",
		"YTM tab status error: unsupported message type",
	} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("stdout = %q, missing %q", stdout.String(), expected)
		}
	}
}

func TestDoctorVerbosePrintsConnectorDetails(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{
				OK: true,
				Data: map[string]any{
					"connectorId":           "com.gormanity.ytm-enhancer.cli",
					"connectorVersion":      "0.1.0",
					"hostName":              "com.gormanity.ytm_enhancer.cli",
					"protocolVersion":       "1.0.0",
					"activeProtocolVersion": "1.0.0",
					"ready":                 true,
					"ytmTabDetected":        false,
					"ytmTabCount":           0,
					"selectedYtmTabKnown":   false,
					"hasState":              false,
				},
			}, nil
		},
	}.Run([]string{"doctor", "--verbose"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	for _, expected := range []string{
		"Connector ID: com.gormanity.ytm-enhancer.cli",
		"Native host: com.gormanity.ytm_enhancer.cli",
		"Ready: true",
		"Active protocol: 1.0.0",
	} {
		if !strings.Contains(stdout.String(), expected) {
			t.Fatalf("stdout = %q, missing %q", stdout.String(), expected)
		}
	}
}

func TestWatchRendersLiveProgressForTerminalOutput(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	requests := 0
	liveOutput := true

	code := App{
		Stdout:     &stdout,
		Stderr:     &stderr,
		LiveOutput: &liveOutput,
		Sleep:      func(time.Duration) {},
		Request: func(request ipc.Request) (ipc.Response, error) {
			requests++
			switch requests {
			case 1:
				return playbackStateResponse("A Walk", "Tycho", true, 158), nil
			default:
				return playbackStateResponse("A Walk", "Tycho", true, 200), nil
			}
		},
	}.Run([]string{"watch", "--count", "2"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	output := stdout.String()
	for _, expected := range []string{
		"\x1b[2K> A Walk - Tycho\n",
		"[############------------] 2:38 / 5:17",
		"\x1b[2F",
		"[###############---------] 3:20 / 5:17",
	} {
		if !strings.Contains(output, expected) {
			t.Fatalf("stdout = %q, missing %q", output, expected)
		}
	}
}

func TestWatchLinesSuppressesProgressOnlyUpdates(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	requests := 0

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Sleep:  func(time.Duration) {},
		Request: func(request ipc.Request) (ipc.Response, error) {
			requests++
			switch requests {
			case 1:
				return playbackStateResponse("A Walk", "Tycho", true, 1), nil
			case 2:
				return playbackStateResponse("A Walk", "Tycho", true, 2), nil
			default:
				return playbackStateResponse("Source", "Tycho", true, 3), nil
			}
		},
	}.Run([]string{"watch", "--lines", "--count", "2"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	lines := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("stdout = %q, want two emitted changes", stdout.String())
	}
	if lines[0] != "playing A Walk - Tycho" {
		t.Fatalf("first line = %q", lines[0])
	}
	if lines[1] != "playing Source - Tycho" {
		t.Fatalf("second line = %q", lines[1])
	}
	if requests != 3 {
		t.Fatalf("requests = %d, want 3 to skip progress-only update", requests)
	}
}

func TestWatchJSONEmitsNewlineDelimitedState(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return playbackStateResponse("A Walk", "Tycho", true, 1), nil
		},
	}.Run([]string{"watch", "--json", "--count", "1"})
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr = %q", code, stderr.String())
	}
	output := stdout.String()
	if strings.Count(output, "\n") != 1 {
		t.Fatalf("stdout = %q, want one newline-delimited JSON object", output)
	}
	if !strings.Contains(output, `"title":"A Walk"`) {
		t.Fatalf("stdout = %q", output)
	}
	if strings.Contains(output, "\n  ") {
		t.Fatalf("stdout = %q, should be compact JSON", output)
	}
}

func TestWatchRejectsInvalidOptions(t *testing.T) {
	for _, args := range [][]string{
		{"watch", "--count", "0"},
		{"watch", "--interval", "0s"},
		{"watch", "--json", "--lines"},
		{"watch", "--wat"},
	} {
		t.Run(strings.Join(args, " "), func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer

			code := App{Stdout: &stdout, Stderr: &stderr}.Run(args)
			if code != 2 {
				t.Fatalf("exit code = %d, want 2", code)
			}
			if stderr.String() == "" {
				t.Fatalf("stderr should explain the invalid option")
			}
		})
	}
}

func TestDaemonStartExplainsBrowserOwnedStartup(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{
		Stdout: &stdout,
		Stderr: &stderr,
		Request: func(request ipc.Request) (ipc.Response, error) {
			return ipc.Response{}, errors.New("socket unavailable")
		},
	}.Run([]string{"daemon", "start"})
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if !strings.Contains(stdout.String(), "browser extension starts the daemon") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "Open YTM Enhancer > Connected Apps") {
		t.Fatalf("stdout = %q", stdout.String())
	}
	if !strings.Contains(stdout.String(), "use Reconnect CLI if it appears") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestDaemonRequiresKnownSubcommand(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{Stdout: &stdout, Stderr: &stderr}.Run([]string{"daemon"})
	if code != 2 {
		t.Fatalf("exit code = %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "daemon requires a subcommand") {
		t.Fatalf("stderr = %q", stderr.String())
	}
	if !strings.Contains(stdout.String(), "ytme daemon status") {
		t.Fatalf("stdout = %q", stdout.String())
	}
}

func TestDaemonRestartIsNotSupported(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer

	code := App{Stdout: &stdout, Stderr: &stderr}.Run(
		[]string{"daemon", "restart"},
	)
	if code != 2 {
		t.Fatalf("exit code = %d, want 2", code)
	}
	if !strings.Contains(stderr.String(), "unknown daemon subcommand: restart") {
		t.Fatalf("stderr = %q", stderr.String())
	}
	if strings.Contains(stdout.String(), "ytme daemon restart") {
		t.Fatalf("stdout = %q, should not list daemon restart", stdout.String())
	}
}

func playbackStateResponse(title string, artist string, isPlaying bool, progress float64) ipc.Response {
	return ipc.Response{
		OK: true,
		Data: map[string]any{
			"state": map[string]any{
				"title":     title,
				"artist":    artist,
				"isPlaying": isPlaying,
				"progress":  progress,
				"duration":  317.0,
			},
		},
	}
}
