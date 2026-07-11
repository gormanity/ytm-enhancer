package connector

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"
	"time"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/ipc"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/native"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/protocol"
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

func TestHandleIPCDaemonStatus(t *testing.T) {
	title := "Song"
	daemon := &Daemon{
		ready: true,
		playbackState: &protocol.PlaybackState{
			Title: &title,
		},
	}

	response := daemon.HandleIPC(context.Background(), ipc.Request{
		Command: "daemon.status",
	})
	if !response.OK {
		t.Fatalf("daemon.status failed: %s", response.Error)
	}
	if response.Data["connectorId"] != protocol.ConnectorID {
		t.Fatalf("connectorId = %v, want %s", response.Data["connectorId"], protocol.ConnectorID)
	}
	if response.Data["connectorVersion"] != protocol.ConnectorVersion {
		t.Fatalf("connectorVersion = %v, want %s", response.Data["connectorVersion"], protocol.ConnectorVersion)
	}
	if response.Data["protocolVersion"] != protocol.ProtocolVersion {
		t.Fatalf("protocolVersion = %v, want %s", response.Data["protocolVersion"], protocol.ProtocolVersion)
	}
	if response.Data["ready"] != true {
		t.Fatalf("ready = %v, want true", response.Data["ready"])
	}
	if response.Data["hasState"] != true {
		t.Fatalf("hasState = %v, want true", response.Data["hasState"])
	}
}

func TestHandleIPCDaemonStatusIncludesYtmTabStatus(t *testing.T) {
	requestReader, requestWriter := io.Pipe()
	daemon := &Daemon{
		connection: native.NewConnection(bytes.NewReader(nil), requestWriter),
		ready:      true,
		pending:    make(map[string]chan protocol.HostMessage),
	}
	responsec := make(chan ipc.Response, 1)

	go func() {
		responsec <- daemon.HandleIPC(context.Background(), ipc.Request{
			Command: "doctor",
		})
	}()

	var message map[string]any
	if err := native.NewConnection(requestReader, nil).Read(&message); err != nil {
		t.Fatalf("failed to decode native message: %v", err)
	}
	if message["type"] != "ytm.getStatus" {
		t.Fatalf("message type = %v, want ytm.getStatus", message["type"])
	}
	requestID, ok := message["requestId"].(string)
	if !ok || requestID == "" {
		t.Fatalf("requestId = %v, want non-empty string", message["requestId"])
	}

	daemon.handleNativeMessage(protocol.HostMessage{
		Type:      "ytm.status",
		RequestID: requestID,
		Status: &protocol.YtmStatus{
			HasTabs:          true,
			TabCount:         2,
			SelectedTabKnown: true,
		},
	})

	select {
	case response := <-responsec:
		if !response.OK {
			t.Fatalf("doctor failed: %s", response.Error)
		}
		if response.Data["ytmTabDetected"] != true {
			t.Fatalf("ytmTabDetected = %v, want true", response.Data["ytmTabDetected"])
		}
		if response.Data["ytmTabCount"] != 2 {
			t.Fatalf("ytmTabCount = %v, want 2", response.Data["ytmTabCount"])
		}
		if response.Data["selectedYtmTabKnown"] != true {
			t.Fatalf("selectedYtmTabKnown = %v, want true", response.Data["selectedYtmTabKnown"])
		}
	case <-time.After(250 * time.Millisecond):
		t.Fatal("doctor did not return YTM tab status")
	}
}

func TestHandleIPCDaemonStopSchedulesShutdown(t *testing.T) {
	shutdownc := make(chan struct{})
	daemon := &Daemon{
		shutdown: func() {
			close(shutdownc)
		},
	}

	response := daemon.HandleIPC(context.Background(), ipc.Request{
		Command: "daemon.stop",
	})
	if !response.OK {
		t.Fatalf("daemon.stop failed: %s", response.Error)
	}

	select {
	case <-shutdownc:
	case <-time.After(250 * time.Millisecond):
		t.Fatal("daemon.stop did not schedule shutdown")
	}
}

func TestConnectorReadyStoresActiveProtocolVersion(t *testing.T) {
	var output bytes.Buffer
	daemon := &Daemon{
		connection: native.NewConnection(bytes.NewReader(nil), &output),
		pending:    make(map[string]chan protocol.HostMessage),
	}

	daemon.handleNativeMessage(protocol.HostMessage{
		Type:            "connector.ready",
		ProtocolVersion: "1.0.0",
	})

	if daemon.activeProtocolVersion() != "1.0.0" {
		t.Fatalf("active protocol = %q, want 1.0.0", daemon.activeProtocolVersion())
	}
}

func TestConnectorLifecycleErrorImmediatelyInvalidatesReadyState(t *testing.T) {
	title := "Song"
	pendingResponse := make(chan protocol.HostMessage, 1)
	daemon := &Daemon{
		ready:          true,
		activeProtocol: "1.0.0",
		playbackState: &protocol.PlaybackState{
			Title: &title,
		},
		pending: map[string]chan protocol.HostMessage{
			"action-1": pendingResponse,
		},
	}

	daemon.handleNativeMessage(protocol.HostMessage{
		Type:    "connector.error",
		Code:    "connector_blocked",
		Message: "Connector com.gormanity.ytm-enhancer.cli is disabled",
	})

	if daemon.isReady() {
		t.Fatal("daemon remained ready after connector disable")
	}
	if daemon.activeProtocolVersion() != "" {
		t.Fatalf("active protocol = %q, want empty", daemon.activeProtocolVersion())
	}
	if daemon.cachedPlaybackState() != nil {
		t.Fatal("cached playback state survived connector disable")
	}
	select {
	case response := <-pendingResponse:
		if response.Code != "connector_blocked" {
			t.Fatalf("pending response code = %q, want connector_blocked", response.Code)
		}
	case <-time.After(250 * time.Millisecond):
		t.Fatal("pending request was not failed by connector disable")
	}
	_, err := daemon.currentPlaybackState(context.Background())
	if err == nil || !strings.Contains(err.Error(), "is disabled") {
		t.Fatalf("currentPlaybackState error = %v, want disable diagnostic", err)
	}
}

func TestRequestErrorDoesNotInvalidateConnectorReadyState(t *testing.T) {
	daemon := &Daemon{
		ready:          true,
		activeProtocol: "1.0.0",
		pending:        make(map[string]chan protocol.HostMessage),
	}

	daemon.handleNativeMessage(protocol.HostMessage{
		Type:      "connector.error",
		RequestID: "action-1",
		Code:      "action_unavailable",
		Message:   "YouTube Music did not expose a control for next",
	})

	if !daemon.isReady() {
		t.Fatal("request-scoped action error invalidated ready state")
	}
	if daemon.activeProtocolVersion() != "1.0.0" {
		t.Fatalf("active protocol = %q, want 1.0.0", daemon.activeProtocolVersion())
	}
}
