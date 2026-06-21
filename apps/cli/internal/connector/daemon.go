package connector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gormanity/ytm-enhancer/apps/cli/internal/ipc"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/native"
	"github.com/gormanity/ytm-enhancer/apps/cli/internal/protocol"
)

const requestTimeout = 5 * time.Second

type Daemon struct {
	connection *native.Connection
	log        io.Writer
	nextID     atomic.Uint64

	mu            sync.Mutex
	ready         bool
	lastError     string
	playbackState *protocol.PlaybackState
	pending       map[string]chan protocol.HostMessage
}

func Run(ctx context.Context, input io.Reader, output io.Writer, log io.Writer) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	daemon := &Daemon{
		connection: native.NewConnection(input, output),
		log:        log,
		pending:    make(map[string]chan protocol.HostMessage),
	}

	errc := make(chan error, 2)
	go func() {
		errc <- ipc.Serve(ctx, daemon.HandleIPC)
	}()
	go func() {
		errc <- daemon.readNativeMessages(ctx)
	}()

	daemon.logf("ytme native host starting")
	daemon.sendHello()

	err := <-errc
	cancel()
	if err != nil && !errors.Is(err, io.EOF) && ctx.Err() == nil {
		daemon.logf("ytme native host stopped with error: %s", err)
		return err
	}
	daemon.logf("ytme native host stopped")
	return nil
}

func (daemon *Daemon) HandleIPC(ctx context.Context, request ipc.Request) ipc.Response {
	switch request.Command {
	case "status", "now":
		state, err := daemon.currentPlaybackState(ctx)
		if err != nil {
			return daemon.errorResponse(err)
		}
		return ipc.Response{
			OK: true,
			Data: map[string]any{
				"state": state,
				"ready": daemon.isReady(),
			},
		}
	case "action":
		action, _ := request.Args["action"].(string)
		if !isAllowedAction(action) {
			return ipc.Response{OK: false, Error: "unsupported playback action"}
		}
		if err := daemon.sendAndWait(ctx, protocol.PlaybackAction(action, daemon.requestID("action"))); err != nil {
			return daemon.errorResponse(err)
		}
		return ipc.Response{OK: true, Message: "ok"}
	case "seek":
		target, err := daemon.seekTarget(ctx, request.Args)
		if err != nil {
			return daemon.errorResponse(err)
		}
		if err := daemon.sendAndWait(ctx, protocol.PlaybackSeek(target, daemon.requestID("seek"))); err != nil {
			return daemon.errorResponse(err)
		}
		return ipc.Response{OK: true, Message: "ok"}
	case "focus":
		if err := daemon.sendAndWait(ctx, protocol.FocusYouTubeMusic(daemon.requestID("focus"))); err != nil {
			return daemon.errorResponse(err)
		}
		return ipc.Response{OK: true, Message: "ok"}
	case "doctor":
		return ipc.Response{
			OK: true,
			Data: map[string]any{
				"connectorId": protocol.ConnectorID,
				"hostName":    protocol.HostName,
				"ready":       daemon.isReady(),
				"lastError":   daemon.lastConnectorError(),
				"hasState":    daemon.cachedPlaybackState() != nil,
			},
		}
	default:
		return ipc.Response{OK: false, Error: "unsupported command"}
	}
}

func (daemon *Daemon) sendHello() {
	requestID := daemon.requestID("hello")
	if err := daemon.send(protocol.Hello(requestID), requestID); err != nil {
		daemon.recordError(err.Error())
	}
}

func (daemon *Daemon) readNativeMessages(ctx context.Context) error {
	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		var message protocol.HostMessage
		if err := daemon.connection.Read(&message); err != nil {
			return err
		}
		daemon.handleNativeMessage(message)
	}
}

func (daemon *Daemon) handleNativeMessage(message protocol.HostMessage) {
	daemon.logf("received native message type=%s requestId=%s", message.Type, message.RequestID)

	switch message.Type {
	case "connector.ready":
		daemon.mu.Lock()
		daemon.ready = true
		daemon.lastError = ""
		daemon.mu.Unlock()
		daemon.resolvePending(message)
		daemon.sendSubscription()
		daemon.refreshPlaybackState()
	case "connector.ack":
		daemon.resolvePending(message)
	case "connector.error":
		daemon.recordError(message.Message)
		daemon.resolvePending(message)
	case "playback.state":
		if message.State != nil {
			daemon.mu.Lock()
			daemon.playbackState = message.State
			daemon.mu.Unlock()
		}
		daemon.resolvePending(message)
	case "connector.uninstallRequested":
		daemon.logf("received uninstall request; CLI has no native uninstall flow yet")
	}
}

func (daemon *Daemon) sendSubscription() {
	requestID := daemon.requestID("subscribe")
	if err := daemon.send(protocol.SubscribePlayback(requestID), requestID); err != nil {
		daemon.recordError(err.Error())
	}
}

func (daemon *Daemon) refreshPlaybackState() {
	requestID := daemon.requestID("state")
	if err := daemon.send(protocol.PlaybackStateRequest(requestID), requestID); err != nil {
		daemon.recordError(err.Error())
	}
}

func (daemon *Daemon) currentPlaybackState(ctx context.Context) (*protocol.PlaybackState, error) {
	if state := daemon.cachedPlaybackState(); state != nil {
		return state, nil
	}

	requestID := daemon.requestID("state")
	message, err := daemon.sendAndWaitForMessage(ctx, protocol.PlaybackStateRequest(requestID), requestID)
	if err != nil {
		return nil, err
	}
	if message.State == nil {
		return nil, errors.New("no playback state is available yet")
	}
	return message.State, nil
}

func (daemon *Daemon) seekTarget(ctx context.Context, args map[string]any) (float64, error) {
	if value, ok := args["time"].(float64); ok {
		if value < 0 {
			return 0, errors.New("seek target must be greater than or equal to 0")
		}
		return value, nil
	}

	offset, ok := args["offset"].(float64)
	if !ok {
		return 0, errors.New("seek requires time or offset")
	}
	state, err := daemon.currentPlaybackState(ctx)
	if err != nil {
		return 0, err
	}
	target := state.Progress + offset
	if target < 0 {
		target = 0
	}
	if state.Duration > 0 && target > state.Duration {
		target = state.Duration
	}
	return target, nil
}

func (daemon *Daemon) sendAndWait(ctx context.Context, message map[string]any) error {
	requestID, _ := message["requestId"].(string)
	_, err := daemon.sendAndWaitForMessage(ctx, message, requestID)
	return err
}

func (daemon *Daemon) sendAndWaitForMessage(ctx context.Context, message map[string]any, requestID string) (protocol.HostMessage, error) {
	if !daemon.isReady() && message["type"] != "connector.hello" {
		return protocol.HostMessage{}, daemon.notReadyError()
	}

	responsec := make(chan protocol.HostMessage, 1)
	daemon.mu.Lock()
	daemon.pending[requestID] = responsec
	daemon.mu.Unlock()

	if err := daemon.connection.Write(message); err != nil {
		daemon.removePending(requestID)
		return protocol.HostMessage{}, err
	}

	waitCtx, cancel := context.WithTimeout(ctx, requestTimeout)
	defer cancel()

	select {
	case response := <-responsec:
		if response.Type == "connector.error" {
			if response.Message == "" {
				return response, errors.New("connector request failed")
			}
			return response, errors.New(response.Message)
		}
		return response, nil
	case <-waitCtx.Done():
		daemon.removePending(requestID)
		return protocol.HostMessage{}, waitCtx.Err()
	}
}

func (daemon *Daemon) send(message map[string]any, requestID string) error {
	responsec := make(chan protocol.HostMessage, 1)
	daemon.mu.Lock()
	daemon.pending[requestID] = responsec
	daemon.mu.Unlock()

	if err := daemon.connection.Write(message); err != nil {
		daemon.removePending(requestID)
		return err
	}
	return nil
}

func (daemon *Daemon) resolvePending(message protocol.HostMessage) {
	if message.RequestID == "" {
		return
	}

	daemon.mu.Lock()
	responsec := daemon.pending[message.RequestID]
	delete(daemon.pending, message.RequestID)
	daemon.mu.Unlock()

	if responsec != nil {
		responsec <- message
	}
}

func (daemon *Daemon) removePending(requestID string) {
	daemon.mu.Lock()
	delete(daemon.pending, requestID)
	daemon.mu.Unlock()
}

func (daemon *Daemon) requestID(prefix string) string {
	return fmt.Sprintf("ytme-%s-%d", prefix, daemon.nextID.Add(1))
}

func (daemon *Daemon) isReady() bool {
	daemon.mu.Lock()
	defer daemon.mu.Unlock()
	return daemon.ready
}

func (daemon *Daemon) cachedPlaybackState() *protocol.PlaybackState {
	daemon.mu.Lock()
	defer daemon.mu.Unlock()
	return daemon.playbackState
}

func (daemon *Daemon) lastConnectorError() string {
	daemon.mu.Lock()
	defer daemon.mu.Unlock()
	return daemon.lastError
}

func (daemon *Daemon) recordError(message string) {
	daemon.mu.Lock()
	daemon.lastError = message
	daemon.mu.Unlock()
}

func (daemon *Daemon) notReadyError() error {
	if lastError := daemon.lastConnectorError(); lastError != "" {
		return fmt.Errorf("YTM Enhancer connector is not ready: %s", lastError)
	}
	return errors.New("YTM Enhancer connector is not ready. Enable Connected Apps and keep the extension running")
}

func (daemon *Daemon) errorResponse(err error) ipc.Response {
	return ipc.Response{OK: false, Error: err.Error()}
}

func (daemon *Daemon) logf(format string, args ...any) {
	if daemon.log == nil {
		return
	}
	_, _ = fmt.Fprintf(daemon.log, format+"\n", args...)
}

func isAllowedAction(action string) bool {
	switch action {
	case "play", "pause", "togglePlay", "next", "previous", "shuffle", "repeat":
		return true
	default:
		return false
	}
}

func DecodeState(value any) (*protocol.PlaybackState, error) {
	payload, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var state protocol.PlaybackState
	if err := json.Unmarshal(payload, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func ParseSeek(value string) (map[string]any, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, errors.New("seek value is required")
	}
	if strings.HasPrefix(value, "+") || strings.HasPrefix(value, "-") {
		offset, err := strconv.ParseFloat(value, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid relative seek value %q", value)
		}
		return map[string]any{"offset": offset}, nil
	}

	seconds, err := parseClockSeconds(value)
	if err != nil {
		return nil, err
	}
	return map[string]any{"time": seconds}, nil
}

func parseClockSeconds(value string) (float64, error) {
	parts := strings.Split(value, ":")
	if len(parts) > 3 {
		return 0, fmt.Errorf("invalid seek value %q", value)
	}

	total := 0.0
	for _, part := range parts {
		number, err := strconv.ParseFloat(part, 64)
		if err != nil {
			return 0, fmt.Errorf("invalid seek value %q", value)
		}
		total = total*60 + number
	}
	if total < 0 {
		return 0, errors.New("seek target must be greater than or equal to 0")
	}
	return total, nil
}
