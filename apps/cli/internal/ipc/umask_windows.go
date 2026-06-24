//go:build windows

package ipc

func setRestrictiveUmask() int {
	return 0
}

func restoreUmask(int) {}
