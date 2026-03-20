package agent

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

type SessionState string

const (
	SessionIdle       SessionState = "idle"
	SessionStreaming   SessionState = "streaming"
	SessionCompacting SessionState = "compacting"
)

type SessionInfo struct {
	ID        string       `json:"id"`
	CWD       string       `json:"cwd"`
	ProjectID string       `json:"projectId"`
	Model     string       `json:"model"`
	State     SessionState `json:"state"`
}

type SessionHandle struct {
	ID        string
	CWD       string
	ProjectID string
	Model     string
	State     SessionState

	process *exec.Cmd
	stdin   *JSONLWriter
	stdout  io.ReadCloser
	done    chan struct{}
	mu      sync.Mutex
}

func (h *SessionHandle) Info() SessionInfo {
	h.mu.Lock()
	defer h.mu.Unlock()
	return SessionInfo{
		ID:        h.ID,
		CWD:       h.CWD,
		ProjectID: h.ProjectID,
		Model:     h.Model,
		State:     h.State,
	}
}

type SessionManager struct {
	mu       sync.RWMutex
	sessions map[string]*SessionHandle
	onEvent  func(sessionID string, data json.RawMessage)
	piBinary string
	manifest *Manifest
}

func NewSessionManager(onEvent func(string, json.RawMessage), manifestPath string) *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*SessionHandle),
		onEvent:  onEvent,
		piBinary: "pi",
		manifest: NewManifest(manifestPath),
	}
}

type RecoveryResult struct {
	ID        string
	Recovered bool
	Error     string
}

func (m *SessionManager) RecoverSessions() []RecoveryResult {
	entries, err := m.manifest.Load()
	if err != nil {
		log.Printf("manifest load failed: %v", err)
		return nil
	}
	if len(entries) == 0 {
		return nil
	}

	results := make([]RecoveryResult, 0, len(entries))
	for _, e := range entries {
		_, err := m.Create(e.ID, e.CWD, e.Model, e.ProjectID)
		if err != nil {
			log.Printf("recovery failed for session %s: %v", e.ID, err)
			m.manifest.Remove(e.ID)
			results = append(results, RecoveryResult{ID: e.ID, Error: err.Error()})
			continue
		}
		results = append(results, RecoveryResult{ID: e.ID, Recovered: true})
	}
	return results
}

func (m *SessionManager) Create(id, cwd, model, projectID string) (*SessionHandle, error) {
	piPath, err := exec.LookPath(m.piBinary)
	if err != nil {
		return nil, fmt.Errorf("pi binary not found: %w", err)
	}

	cmd := exec.Command(piPath, "--mode", "rpc")
	cmd.Dir = cwd

	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("stdin pipe: %w", err)
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		stdinPipe.Close()
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		stdinPipe.Close()
		stdoutPipe.Close()
		return nil, fmt.Errorf("start pi: %w", err)
	}

	handle := &SessionHandle{
		ID:        id,
		CWD:       cwd,
		ProjectID: projectID,
		Model:     model,
		State:     SessionIdle,
		process:   cmd,
		stdin:     NewJSONLWriter(stdinPipe),
		stdout:    stdoutPipe,
		done:      make(chan struct{}),
	}

	m.mu.Lock()
	m.sessions[id] = handle
	m.mu.Unlock()

	m.manifest.Add(ManifestEntry{
		ID:        id,
		CWD:       cwd,
		Model:     model,
		ProjectID: projectID,
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})

	go m.readLoop(handle)

	return handle, nil
}

func (m *SessionManager) readLoop(h *SessionHandle) {
	defer close(h.done)
	reader := NewJSONLReader(h.stdout)
	for {
		raw, err := reader.Read()
		if err != nil {
			if err != io.EOF {
				errEvent, _ := json.Marshal(map[string]string{
					"type":      "session_error",
					"sessionId": h.ID,
					"error":     err.Error(),
				})
				m.onEvent(h.ID, errEvent)
			}

			h.mu.Lock()
			h.State = SessionIdle
			h.mu.Unlock()

			m.mu.Lock()
			delete(m.sessions, h.ID)
			m.mu.Unlock()

			h.process.Wait()

			m.manifest.Remove(h.ID)

			exitEvent, _ := json.Marshal(map[string]string{
				"type":      "session_exit",
				"sessionId": h.ID,
			})
			m.onEvent(h.ID, exitEvent)
			return
		}

		kind := ClassifyOutput(raw)
		if kind == "event" {
			var ev struct{ Type string `json:"type"` }
			json.Unmarshal(raw, &ev)

			h.mu.Lock()
			switch ev.Type {
			case "agent_start":
				h.State = SessionStreaming
			case "agent_end":
				h.State = SessionIdle
			}
			h.mu.Unlock()
		}

		m.onEvent(h.ID, raw)
	}
}

func (m *SessionManager) Send(id string, cmd json.RawMessage) error {
	m.mu.RLock()
	h, ok := m.sessions[id]
	m.mu.RUnlock()
	if !ok {
		return fmt.Errorf("session %q not found", id)
	}
	select {
	case <-h.done:
		return fmt.Errorf("session %q has exited", id)
	default:
	}
	return h.stdin.Write(cmd)
}

func (m *SessionManager) Get(id string) *SessionHandle {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[id]
}

func (m *SessionManager) List() []SessionInfo {
	m.mu.RLock()
	defer m.mu.RUnlock()
	result := make([]SessionInfo, 0, len(m.sessions))
	for _, h := range m.sessions {
		result = append(result, h.Info())
	}
	return result
}

func (m *SessionManager) Destroy(id string) error {
	m.mu.Lock()
	h, ok := m.sessions[id]
	if !ok {
		m.mu.Unlock()
		return fmt.Errorf("session %q not found", id)
	}
	delete(m.sessions, id)
	m.mu.Unlock()

	if h.process.Process != nil {
		h.process.Process.Signal(syscall.SIGTERM)
		select {
		case <-h.done:
		case <-time.After(5 * time.Second):
			h.process.Process.Kill()
		}
	}
	<-h.done
	h.process.Wait()
	m.manifest.Remove(id)
	return nil
}

func (m *SessionManager) Shutdown() {
	m.mu.Lock()
	handles := make([]*SessionHandle, 0, len(m.sessions))
	for _, h := range m.sessions {
		handles = append(handles, h)
	}
	m.sessions = make(map[string]*SessionHandle)
	m.mu.Unlock()

	if len(handles) == 0 {
		m.manifest.Clear()
		return
	}

	log.Printf("shutting down %d sessions...", len(handles))

	var wg sync.WaitGroup
	for _, h := range handles {
		wg.Add(1)
		go func(h *SessionHandle) {
			defer wg.Done()
			if h.process.Process == nil {
				return
			}
			h.process.Process.Signal(syscall.SIGTERM)
			select {
			case <-h.done:
			case <-time.After(5 * time.Second):
				h.process.Process.Kill()
			}
			<-h.done
			h.process.Wait()
		}(h)
	}

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		log.Printf("shutdown timeout, force killing remaining sessions")
		for _, h := range handles {
			select {
			case <-h.done:
			default:
				if h.process.Process != nil {
					h.process.Process.Kill()
				}
			}
		}
		<-done
	}

	m.manifest.Clear()
	log.Printf("all sessions shut down")
}
