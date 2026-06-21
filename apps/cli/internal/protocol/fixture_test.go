package protocol

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestHelloMessageMatchesSharedFixture(t *testing.T) {
	var fixture map[string]any
	if err := json.Unmarshal(readSharedFixture(t, "cli-hello.json"), &fixture); err != nil {
		t.Fatalf("fixture decode failed: %v", err)
	}

	expected, err := json.Marshal(fixture)
	if err != nil {
		t.Fatalf("fixture encode failed: %v", err)
	}
	actual, err := json.Marshal(Hello("hello-1"))
	if err != nil {
		t.Fatalf("hello encode failed: %v", err)
	}

	if string(actual) != string(expected) {
		t.Fatalf("hello fixture mismatch\nactual:   %s\nexpected: %s", actual, expected)
	}
}

func readSharedFixture(t *testing.T, name string) []byte {
	t.Helper()
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("could not resolve current file")
	}
	root := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "../../../.."))
	payload, err := os.ReadFile(filepath.Join(root, "packages/connector-protocol/fixtures", name))
	if err != nil {
		t.Fatalf("fixture read failed: %v", err)
	}
	return payload
}
