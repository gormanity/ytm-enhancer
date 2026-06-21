//go:build !windows

package ipc

import "syscall"

func setRestrictiveUmask() int {
	return syscall.Umask(0o177)
}

func restoreUmask(value int) {
	syscall.Umask(value)
}
