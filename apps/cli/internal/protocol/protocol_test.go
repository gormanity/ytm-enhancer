package protocol

import "testing"

func TestHelloMessageUsesSharedConnectorManifest(t *testing.T) {
	message := Hello("hello-1")
	if message["type"] != "connector.hello" {
		t.Fatalf("type = %v, want connector.hello", message["type"])
	}
	if message["requestId"] != "hello-1" {
		t.Fatalf("requestId = %v, want hello-1", message["requestId"])
	}

	manifest, ok := message["manifest"].(map[string]any)
	if !ok {
		t.Fatal("manifest is not an object")
	}
	if manifest["id"] != ConnectorID {
		t.Fatalf("manifest id = %v, want %s", manifest["id"], ConnectorID)
	}
	if manifest["name"] != ConnectorName {
		t.Fatalf("manifest name = %v, want %s", manifest["name"], ConnectorName)
	}
	if manifest["protocolVersion"] != ProtocolVersion {
		t.Fatalf("protocol version = %v, want %s", manifest["protocolVersion"], ProtocolVersion)
	}
}
