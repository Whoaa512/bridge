package agent

import (
	"encoding/json"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestStressConcurrentSessions(t *testing.T) {
	script := helperScript(t)
	const n = 10

	var mu sync.Mutex
	events := make(map[string][]json.RawMessage)

	sm := NewSessionManager(func(sessionID string, data json.RawMessage) {
		mu.Lock()
		events[sessionID] = append(events[sessionID], data)
		mu.Unlock()
	}, filepath.Join(t.TempDir(), "active.json"))
	sm.piBinary = script
	defer sm.Shutdown()

	var wgCreate sync.WaitGroup
	handles := make([]*SessionHandle, n)
	errs := make([]error, n)

	for i := 0; i < n; i++ {
		wgCreate.Add(1)
		go func(i int) {
			defer wgCreate.Done()
			id := fmt.Sprintf("stress-%d", i)
			h, err := sm.Create(id, t.TempDir(), "model", "proj")
			handles[i] = h
			errs[i] = err
		}(i)
	}
	wgCreate.Wait()

	for i, err := range errs {
		if err != nil {
			t.Fatalf("create stress-%d: %v", i, err)
		}
	}

	sessions := sm.List()
	if len(sessions) != n {
		t.Fatalf("sessions = %d, want %d", len(sessions), n)
	}

	for i := 0; i < n; i++ {
		id := fmt.Sprintf("stress-%d", i)
		cmd, _ := json.Marshal(map[string]string{"type": "ping", "id": id})
		if err := sm.Send(id, cmd); err != nil {
			t.Errorf("send to %s: %v", id, err)
		}
	}

	deadline := time.After(5 * time.Second)
	for {
		mu.Lock()
		total := 0
		for _, evs := range events {
			for _, ev := range evs {
				if strings.Contains(string(ev), "ping") {
					total++
				}
			}
		}
		mu.Unlock()
		if total >= n {
			break
		}
		select {
		case <-deadline:
			t.Fatalf("timeout: only received %d/%d echo events", total, n)
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	var wgDestroy sync.WaitGroup
	for i := 0; i < n; i++ {
		wgDestroy.Add(1)
		go func(i int) {
			defer wgDestroy.Done()
			id := fmt.Sprintf("stress-%d", i)
			if err := sm.Destroy(id); err != nil {
				t.Errorf("destroy %s: %v", id, err)
			}
		}(i)
	}
	wgDestroy.Wait()

	if len(sm.List()) != 0 {
		t.Errorf("sessions remain: %d", len(sm.List()))
	}
}
