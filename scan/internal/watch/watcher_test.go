package watch

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestScanningSuppress(t *testing.T) {
	c := NewCache()
	var callCount atomic.Int32

	w, err := NewWatcher(c, func(path string) {
		callCount.Add(1)
	})
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()

	w.SetScanning(true)

	w.mu.Lock()
	w.pending["/some/project"] = time.Now().Add(-200 * time.Millisecond)
	w.mu.Unlock()

	time.Sleep(200 * time.Millisecond)

	if callCount.Load() != 0 {
		t.Errorf("onChange should not fire during scan, got %d calls", callCount.Load())
	}

	w.mu.Lock()
	pendingLen := len(w.pending)
	w.mu.Unlock()

	if pendingLen != 0 {
		t.Errorf("pending events should be dropped during scan, got %d", pendingLen)
	}
}

func TestCooldownSuppressAfterScan(t *testing.T) {
	c := NewCache()
	var callCount atomic.Int32

	w, err := NewWatcher(c, func(path string) {
		callCount.Add(1)
	})
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()

	w.SetScanning(true)
	w.SetScanning(false)

	w.mu.Lock()
	w.pending["/some/project"] = time.Now().Add(-200 * time.Millisecond)
	w.mu.Unlock()

	time.Sleep(200 * time.Millisecond)

	if callCount.Load() != 0 {
		t.Errorf("onChange should not fire during cooldown, got %d calls", callCount.Load())
	}
}

func TestEventsAfterCooldown(t *testing.T) {
	c := NewCache()
	var callCount atomic.Int32
	var watcher *Watcher

	watcher, err := NewWatcher(c, func(path string) {
		callCount.Add(1)
		watcher.SetScanning(false)
	})
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer watcher.Close()

	watcher.mu.Lock()
	watcher.coolUntil = time.Now().Add(-1 * time.Second)
	watcher.mu.Unlock()

	watcher.mu.Lock()
	watcher.pending["/some/project"] = time.Now().Add(-200 * time.Millisecond)
	watcher.mu.Unlock()

	time.Sleep(200 * time.Millisecond)

	if callCount.Load() != 1 {
		t.Errorf("events after cooldown should fire, got %d calls", callCount.Load())
	}
}

func TestFlushSetsScanningBeforeCallback(t *testing.T) {
	c := NewCache()
	var wasScanning atomic.Bool
	var watcher *Watcher

	watcher, err := NewWatcher(c, func(path string) {
		watcher.mu.Lock()
		wasScanning.Store(watcher.scanning)
		watcher.mu.Unlock()
		watcher.SetScanning(false)
	})
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer watcher.Close()

	watcher.mu.Lock()
	watcher.pending["/some/project"] = time.Now().Add(-200 * time.Millisecond)
	watcher.mu.Unlock()

	time.Sleep(200 * time.Millisecond)

	if !wasScanning.Load() {
		t.Error("scanning should be true when onChange is called")
	}
}
