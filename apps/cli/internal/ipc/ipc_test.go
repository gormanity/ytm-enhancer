package ipc

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSocketPathUsesIsolatedRuntimeDirectory(t *testing.T) {
	runtimeDirectory := filepath.Join(t.TempDir(), "project-runtime")
	t.Setenv(runtimeDirEnvironmentVariable, runtimeDirectory)

	path, err := SocketPath()
	if err != nil {
		t.Fatalf("SocketPath failed: %v", err)
	}
	if path != filepath.Join(runtimeDirectory, socketName) {
		t.Fatalf("socket path = %q, want runtime-specific path", path)
	}
	info, err := os.Stat(runtimeDirectory)
	if err != nil {
		t.Fatalf("runtime directory stat failed: %v", err)
	}
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0o700 {
		t.Fatalf("runtime directory mode = %o, want 700", info.Mode().Perm())
	}
}
