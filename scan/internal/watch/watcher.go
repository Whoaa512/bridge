package watch

import (
	"log"
	"log/slog"
	"path/filepath"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

type Watcher struct {
	watcher    *fsnotify.Watcher
	cache      *Cache
	onChange   func(projectPath string)
	coalesceMs time.Duration

	mu        sync.Mutex
	pending   map[string]time.Time
	projects  map[string]string
	scanning  bool
	coolUntil time.Time

	done chan struct{}
}

func NewWatcher(cache *Cache, onChange func(projectPath string)) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		watcher:    fsw,
		cache:      cache,
		onChange:   onChange,
		coalesceMs: 100 * time.Millisecond,
		pending:    make(map[string]time.Time),
		projects:   make(map[string]string),
		done:       make(chan struct{}),
	}

	go w.loop()
	return w, nil
}

func (w *Watcher) WatchProject(projectPath string) error {
	gitDir := filepath.Join(projectPath, ".git")

	w.mu.Lock()
	w.projects[gitDir] = projectPath
	w.mu.Unlock()

	return w.watcher.Add(gitDir)
}

func (w *Watcher) SetScanning(v bool) {
	w.mu.Lock()
	w.scanning = v
	if !v {
		w.coolUntil = time.Now().Add(2 * time.Second)
	}
	w.mu.Unlock()
}

func (w *Watcher) Close() error {
	close(w.done)
	return w.watcher.Close()
}

func (w *Watcher) loop() {
	ticker := time.NewTicker(50 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-w.done:
			return

		case event, ok := <-w.watcher.Events:
			if !ok {
				return
			}
			w.handleEvent(event)

		case err, ok := <-w.watcher.Errors:
			if !ok {
				return
			}
			log.Printf("fsnotify error: %v", err)

		case <-ticker.C:
			w.flushPending()
		}
	}
}

func (w *Watcher) handleEvent(event fsnotify.Event) {
	if event.Op == fsnotify.Chmod {
		return
	}

	base := filepath.Base(event.Name)
	if isNoisyGitFile(base) {
		return
	}

	dir := filepath.Dir(event.Name)

	w.mu.Lock()
	defer w.mu.Unlock()

	if w.suppressed() {
		slog.Debug("[watch] suppressed event", "op", event.Op, "name", event.Name)
		return
	}

	projectPath, ok := w.projects[dir]
	if !ok {
		parentDir := filepath.Dir(dir)
		projectPath, ok = w.projects[parentDir]
		if !ok {
			return
		}
	}

	slog.Debug("[watch] event", "op", event.Op, "file", base, "project", filepath.Base(projectPath))
	w.pending[projectPath] = time.Now()
}

func isNoisyGitFile(name string) bool {
	switch name {
	case "fsmonitor--daemon.ipc",
		"index.lock",
		"gc.log",
		"gc.log.lock",
		"FETCH_HEAD.lock",
		"FETCH_HEAD",
		"config.lock",
		"shallow.lock":
		return true
	}
	return false
}

func (w *Watcher) suppressed() bool {
	return w.scanning || time.Now().Before(w.coolUntil)
}

func (w *Watcher) flushPending() {
	w.mu.Lock()

	if w.suppressed() {
		n := len(w.pending)
		for p := range w.pending {
			delete(w.pending, p)
		}
		if n > 0 {
			slog.Debug("[watch] dropped pending events (suppressed)", "count", n)
		}
		w.mu.Unlock()
		return
	}

	now := time.Now()
	var ready []string
	for path, when := range w.pending {
		if now.Sub(when) >= w.coalesceMs {
			ready = append(ready, path)
		}
	}
	for _, p := range ready {
		delete(w.pending, p)
	}

	if len(ready) > 0 {
		w.scanning = true
		log.Printf("[watch] flushing %d dirty projects, triggering rescan", len(ready))
		for _, p := range ready {
			log.Printf("[watch]   dirty: %s", filepath.Base(p))
		}
	}
	w.mu.Unlock()

	if len(ready) == 0 {
		return
	}

	for _, projectPath := range ready {
		w.cache.InvalidatePrefix(projectPath)
	}

	if w.onChange != nil {
		w.onChange(ready[0])
	}
}
