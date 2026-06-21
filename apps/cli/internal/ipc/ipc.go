package ipc

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"
)

const socketName = "ytme-cli.sock"

type Request struct {
	Command string         `json:"command"`
	Args    map[string]any `json:"args,omitempty"`
}

type Response struct {
	OK      bool           `json:"ok"`
	Message string         `json:"message,omitempty"`
	Error   string         `json:"error,omitempty"`
	Data    map[string]any `json:"data,omitempty"`
}

type Handler func(context.Context, Request) Response

func SocketPath() (string, error) {
	root := filepath.Join(os.TempDir(), fmt.Sprintf("ytm-enhancer-%d", os.Getuid()))
	if err := os.MkdirAll(root, 0o700); err != nil {
		return "", err
	}
	if err := os.Chmod(root, 0o700); err != nil {
		return "", err
	}
	return filepath.Join(root, socketName), nil
}

func Serve(ctx context.Context, handler Handler) error {
	path, err := SocketPath()
	if err != nil {
		return err
	}
	if err := removeStaleSocket(path); err != nil {
		return err
	}

	previousUmask := setRestrictiveUmask()
	listener, err := net.Listen("unix", path)
	restoreUmask(previousUmask)
	if err != nil {
		return err
	}
	if err := os.Chmod(path, 0o600); err != nil {
		_ = listener.Close()
		return err
	}

	go func() {
		<-ctx.Done()
		_ = listener.Close()
		_ = os.Remove(path)
	}()

	for {
		connection, err := listener.Accept()
		if err != nil {
			if ctx.Err() != nil || errors.Is(err, net.ErrClosed) {
				return nil
			}
			return err
		}
		go serveConnection(ctx, connection, handler)
	}
}

func Send(ctx context.Context, request Request) (Response, error) {
	path, err := SocketPath()
	if err != nil {
		return Response{}, err
	}

	var dialer net.Dialer
	connection, err := dialer.DialContext(ctx, "unix", path)
	if err != nil {
		return Response{}, err
	}
	defer connection.Close()

	if deadline, ok := ctx.Deadline(); ok {
		_ = connection.SetDeadline(deadline)
	}

	if err := json.NewEncoder(connection).Encode(request); err != nil {
		return Response{}, err
	}
	var response Response
	if err := json.NewDecoder(connection).Decode(&response); err != nil {
		return Response{}, err
	}
	return response, nil
}

func removeStaleSocket(path string) error {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	connection, err := net.DialTimeout("unix", path, 200*time.Millisecond)
	if err == nil {
		_ = connection.Close()
		return fmt.Errorf("ytme native host socket already exists at %s", path)
	}
	return os.Remove(path)
}

func serveConnection(ctx context.Context, connection net.Conn, handler Handler) {
	defer connection.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = connection.SetDeadline(deadline)
	}

	var request Request
	if err := json.NewDecoder(connection).Decode(&request); err != nil {
		_ = json.NewEncoder(connection).Encode(Response{
			OK:    false,
			Error: fmt.Sprintf("invalid request: %s", err),
		})
		return
	}
	_ = json.NewEncoder(connection).Encode(handler(ctx, request))
}
