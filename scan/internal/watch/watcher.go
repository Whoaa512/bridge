package watch

import (
	"log"
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

	mu       sync.Mutex
	pending  map[string]time.Time
	projects map[string]string // watched dir → project path

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
	dir := filepath.Dir(event.Name)

	w.mu.Lock()
	defer w.mu.Unlock()

	projectPath, ok := w.projects[dir]
	if !ok {
		parentDir := filepath.Dir(dir)
		projectPath, ok = w.projects[parentDir]
		if !ok {
			return
		}
	}

	w.pending[projectPath] = time.Now()
}

func (w *Watcher) flushPending() {
	w.mu.Lock()
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
	w.mu.Unlock()

	for _, projectPath := range ready {
		w.cache.InvalidatePrefix(projectPath)
		if w.onChange != nil {
			w.onChange(projectPath)
		}
	}
}
