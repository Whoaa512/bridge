package spec

import (
	"fmt"
	"os"
	"syscall"
)

type FileLock struct {
	f *os.File
}

func AcquireLock() (*FileLock, error) {
	if err := EnsureDir(); err != nil {
		return nil, err
	}

	f, err := os.OpenFile(LockPath(), os.O_CREATE|os.O_RDWR, 0600)
	if err != nil {
		return nil, fmt.Errorf("open lock file: %w", err)
	}

	if err := syscall.Flock(int(f.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		f.Close()
		return nil, fmt.Errorf("another bridge process is running (lock held)")
	}

	return &FileLock{f: f}, nil
}

func (l *FileLock) Release() {
	if l.f == nil {
		return
	}
	syscall.Flock(int(l.f.Fd()), syscall.LOCK_UN)
	l.f.Close()
	os.Remove(LockPath())
}
