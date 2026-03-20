package agent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func helperScript(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	if runtime.GOOS == "windows" {
		t.Skip("test requires unix shell")
	}

	script := filepath.Join(dir, "fake-pi")
	content := `#!/bin/sh
while IFS= read -r line; do
  echo "$line"
done
`
	if err := os.WriteFile(script, []byte(content), 0755); err != nil {
		t.Fatalf("write script: %v", err)
	}
	return script
}

func helperScriptExitCode(t *testing.T, code int) string {
	t.Helper()
	dir := t.TempDir()

	if runtime.GOOS == "windows" {
		t.Skip("test requires unix shell")
	}

	script := filepath.Join(dir, "fake-pi")
	content := fmt.Sprintf("#!/bin/sh\nexit %d\n", code)
	if err := os.WriteFile(script, []byte(content), 0755); err != nil {
		t.Fatalf("write script: %v", err)
	}
	return script
}

func testManager(t *testing.T, script string) *SessionManager {
	t.Helper()
	var mu sync.Mutex
	events := make([]json.RawMessage, 0)

	manifestPath := filepath.Join(t.TempDir(), "active.json")
	sm := NewSessionManager(func(sessionID string, data json.RawMessage) {
		mu.Lock()
		events = append(events, data)
		mu.Unlock()
	}, manifestPath)
	sm.piBinary = script
	return sm
}

func TestSessionCreateAndList(t *testing.T) {
	script := helperScript(t)
	sm := testManager(t, script)
	defer sm.Shutdown()

	h, err := sm.Create("sess-1", t.TempDir(), "test-model", "proj-1")
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if h.ID != "sess-1" {
		t.Errorf("id = %q", h.ID)
	}

	sessions := sm.List()
	if len(sessions) != 1 {
		t.Fatalf("sessions = %d, want 1", len(sessions))
	}
	if sessions[0].ID != "sess-1" {
		t.Errorf("session id = %q", sessions[0].ID)
	}
	if sessions[0].State != SessionIdle {
		t.Errorf("state = %q, want idle", sessions[0].State)
	}
}

func TestSessionGet(t *testing.T) {
	script := helperScript(t)
	sm := testManager(t, script)
	defer sm.Shutdown()

	sm.Create("sess-1", t.TempDir(), "model", "proj")

	h := sm.Get("sess-1")
	if h == nil {
		t.Fatal("get returned nil")
	}
	if h.ID != "sess-1" {
		t.Errorf("id = %q", h.ID)
	}

	if sm.Get("nonexistent") != nil {
		t.Error("expected nil for nonexistent session")
	}
}

func TestSessionSendEcho(t *testing.T) {
	script := helperScript(t)

	var mu sync.Mutex
	var events []json.RawMessage

	sm := NewSessionManager(func(sessionID string, data json.RawMessage) {
		mu.Lock()
		events = append(events, data)
		mu.Unlock()
	}, filepath.Join(t.TempDir(), "active.json"))
	sm.piBinary = script
	defer sm.Shutdown()

	sm.Create("sess-1", t.TempDir(), "model", "proj")

	cmd, _ := json.Marshal(map[string]string{"type": "get_state"})
	if err := sm.Send("sess-1", cmd); err != nil {
		t.Fatalf("send: %v", err)
	}

	deadline := time.After(3 * time.Second)
	for {
		mu.Lock()
		n := len(events)
		mu.Unlock()
		if n > 0 {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timeout waiting for echo event")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	mu.Lock()
	first := events[0]
	mu.Unlock()

	if !strings.Contains(string(first), "get_state") {
		t.Errorf("expected echoed get_state, got %s", first)
	}
}

func TestSessionSendNotFound(t *testing.T) {
	sm := NewSessionManager(func(string, json.RawMessage) {}, filepath.Join(t.TempDir(), "active.json"))
	err := sm.Send("nonexistent", json.RawMessage(`{}`))
	if err == nil {
		t.Error("expected error for nonexistent session")
	}
}

func TestSessionDestroy(t *testing.T) {
	script := helperScript(t)
	sm := testManager(t, script)

	sm.Create("sess-1", t.TempDir(), "model", "proj")

	if err := sm.Destroy("sess-1"); err != nil {
		t.Fatalf("destroy: %v", err)
	}

	if sm.Get("sess-1") != nil {
		t.Error("session still exists after destroy")
	}
	if len(sm.List()) != 0 {
		t.Error("list not empty after destroy")
	}
}

func TestSessionDestroyNotFound(t *testing.T) {
	sm := NewSessionManager(func(string, json.RawMessage) {}, filepath.Join(t.TempDir(), "active.json"))
	if err := sm.Destroy("nonexistent"); err == nil {
		t.Error("expected error for nonexistent session")
	}
}

func TestSessionShutdown(t *testing.T) {
	script := helperScript(t)
	manifestPath := filepath.Join(t.TempDir(), "active.json")
	sm := NewSessionManager(func(string, json.RawMessage) {}, manifestPath)
	sm.piBinary = script

	sm.Create("sess-1", t.TempDir(), "model", "proj")
	sm.Create("sess-2", t.TempDir(), "model", "proj")
	sm.Create("sess-3", t.TempDir(), "model", "proj")

	sm.Shutdown()

	if len(sm.List()) != 0 {
		t.Errorf("sessions remain after shutdown: %d", len(sm.List()))
	}

	m := NewManifest(manifestPath)
	entries, _ := m.Load()
	if len(entries) != 0 {
		t.Errorf("manifest not cleared after shutdown: %d entries", len(entries))
	}
}

func TestSessionExitEvent(t *testing.T) {
	script := helperScript(t)

	var mu sync.Mutex
	var events []json.RawMessage

	sm := NewSessionManager(func(sessionID string, data json.RawMessage) {
		mu.Lock()
		events = append(events, data)
		mu.Unlock()
	}, filepath.Join(t.TempDir(), "active.json"))
	sm.piBinary = script
	defer sm.Shutdown()

	sm.Create("sess-1", t.TempDir(), "model", "proj")
	sm.Destroy("sess-1")

	time.Sleep(100 * time.Millisecond)

	mu.Lock()
	defer mu.Unlock()

	found := false
	for _, ev := range events {
		if strings.Contains(string(ev), "session_exit") {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected session_exit event after destroy")
	}
}

func TestRecoverSessions(t *testing.T) {
	script := helperScript(t)
	manifestPath := filepath.Join(t.TempDir(), "active.json")

	m := NewManifest(manifestPath)
	cwd := t.TempDir()
	m.Add(ManifestEntry{ID: "recover-1", CWD: cwd, Model: "model", ProjectID: "proj", CreatedAt: "2024-01-01T00:00:00Z"})
	m.Add(ManifestEntry{ID: "recover-2", CWD: cwd, Model: "model", ProjectID: "proj", CreatedAt: "2024-01-01T00:01:00Z"})

	sm := NewSessionManager(func(string, json.RawMessage) {}, manifestPath)
	sm.piBinary = script
	defer sm.Shutdown()

	results := sm.RecoverSessions()
	if len(results) != 2 {
		t.Fatalf("results = %d, want 2", len(results))
	}

	recovered := 0
	for _, r := range results {
		if r.Recovered {
			recovered++
		}
	}
	if recovered != 2 {
		t.Errorf("recovered = %d, want 2", recovered)
	}

	sessions := sm.List()
	if len(sessions) != 2 {
		t.Errorf("sessions = %d, want 2", len(sessions))
	}
}

func TestRecoverSessionsBadCWD(t *testing.T) {
	script := helperScript(t)
	manifestPath := filepath.Join(t.TempDir(), "active.json")

	m := NewManifest(manifestPath)
	m.Add(ManifestEntry{ID: "bad-1", CWD: "/nonexistent/path/that/does/not/exist", Model: "model", ProjectID: "proj"})

	sm := NewSessionManager(func(string, json.RawMessage) {}, manifestPath)
	sm.piBinary = script
	defer sm.Shutdown()

	results := sm.RecoverSessions()
	if len(results) != 1 {
		t.Fatalf("results = %d, want 1", len(results))
	}
	if results[0].Recovered {
		t.Error("expected recovery failure for bad cwd")
	}
	if results[0].Error == "" {
		t.Error("expected error message")
	}

	entries, _ := m.Load()
	if len(entries) != 0 {
		t.Errorf("manifest should be empty after failed recovery, got %d", len(entries))
	}
}

func TestSessionExitCode(t *testing.T) {
	script := helperScriptExitCode(t, 1)

	var mu sync.Mutex
	var events []json.RawMessage

	sm := NewSessionManager(func(_ string, data json.RawMessage) {
		mu.Lock()
		events = append(events, data)
		mu.Unlock()
	}, filepath.Join(t.TempDir(), "active.json"))
	sm.piBinary = script
	defer sm.Shutdown()

	sm.Create("sess-crash", t.TempDir(), "model", "proj")

	deadline := time.After(3 * time.Second)
	for {
		mu.Lock()
		found := false
		for _, ev := range events {
			if strings.Contains(string(ev), "session_exit") {
				found = true
				break
			}
		}
		mu.Unlock()
		if found {
			break
		}
		select {
		case <-deadline:
			t.Fatal("timeout waiting for session_exit")
		default:
			time.Sleep(10 * time.Millisecond)
		}
	}

	mu.Lock()
	defer mu.Unlock()

	for _, ev := range events {
		var obj map[string]interface{}
		json.Unmarshal(ev, &obj)
		if obj["type"] == "session_exit" {
			code, ok := obj["exitCode"].(float64)
			if !ok {
				t.Error("exitCode missing from session_exit")
				return
			}
			if int(code) != 1 {
				t.Errorf("exitCode = %v, want 1", code)
			}
			return
		}
	}
	t.Error("session_exit not found in events")
}
