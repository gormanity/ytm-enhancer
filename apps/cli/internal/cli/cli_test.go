package cli

import (
	"bytes"
	"strings"
	"testing"
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
