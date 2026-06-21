package native

import (
	"bytes"
	"testing"
)

func TestConnectionRoundTripUsesNativeMessagingFrame(t *testing.T) {
	var buffer bytes.Buffer
	writer := NewConnection(nil, &buffer)
	if err := writer.Write(map[string]any{
		"type":      "connector.hello",
		"requestId": "hello-1",
	}); err != nil {
		t.Fatalf("write failed: %v", err)
	}

	var decoded map[string]any
	reader := NewConnection(&buffer, nil)
	if err := reader.Read(&decoded); err != nil {
		t.Fatalf("read failed: %v", err)
	}
	if decoded["type"] != "connector.hello" {
		t.Fatalf("type = %v, want connector.hello", decoded["type"])
	}
	if decoded["requestId"] != "hello-1" {
		t.Fatalf("requestId = %v, want hello-1", decoded["requestId"])
	}
}
