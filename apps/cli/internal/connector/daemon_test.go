package connector

import (
	"context"
	"testing"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/ipc"
)

func TestParseSeekSupportsAbsoluteClockValues(t *testing.T) {
	args, err := ParseSeek("1:23")
	if err != nil {
		t.Fatalf("ParseSeek failed: %v", err)
	}
	if args["time"] != 83.0 {
		t.Fatalf("time = %v, want 83", args["time"])
	}
}

func TestParseSeekSupportsRelativeOffsets(t *testing.T) {
	args, err := ParseSeek("-5")
	if err != nil {
		t.Fatalf("ParseSeek failed: %v", err)
	}
	if args["offset"] != -5.0 {
		t.Fatalf("offset = %v, want -5", args["offset"])
	}
}

func TestHandleIPCRejectsUnknownCommands(t *testing.T) {
	daemon := &Daemon{}
	response := daemon.HandleIPC(context.Background(), ipc.Request{
		Command: "explode",
	})
	if response.OK {
		t.Fatal("unknown command succeeded")
	}
	if response.Error != "unsupported command" {
		t.Fatalf("error = %q, want unsupported command", response.Error)
	}
}
