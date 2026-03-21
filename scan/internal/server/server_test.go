package server

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/config"
	"github.com/cjwinslow/bridge/scan/internal/spec"
	"github.com/gorilla/websocket"
)

func testSpec() *spec.BridgeSpec {
	now := time.Now().UTC()
	return &spec.BridgeSpec{
		Version:   spec.Version,
		ScannedAt: now,
		Machine:   spec.Machine{Hostname: "test", OS: "darwin", Uptime: 1000},
		Projects: []spec.Project{
			{
				ID:                   "project:code/test",
				Path:                 "/code/test",
				Name:                 "test",
				Kind:                 "git_repo",
				Classification:       "personal",
				ClassificationSource: "remote",
				Languages:            []string{},
				Flags:                []string{},
				Errors:               []spec.ScanErr{},
				PRs:                  []spec.PR{},
				Tasks:                []spec.Task{},
				Subprojects:          []string{},
			},
		},
		Infrastructure: spec.Infrastructure{
			Ports:  []spec.Port{},
			Docker: []spec.DockerContainer{},
			Resources: spec.Resources{
				CPUByProject: map[string]float64{},
				MemByProject: map[string]int64{},
			},
		},
		Alerts: []spec.Alert{},
		Cycle: spec.Cycle{
			Period:  "daily",
			Start:   now.Add(-24 * time.Hour),
			End:     now,
			Summary: spec.CycleSummary{},
		},
	}
}

func TestHealthEndpoint(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	req := httptest.NewRequest("GET", "/api/health", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var body map[string]interface{}
	json.Unmarshal(w.Body.Bytes(), &body)

	if body["status"] != "ok" {
		t.Errorf("status = %v, want ok", body["status"])
	}
	if _, ok := body["uptime"]; !ok {
		t.Error("missing uptime field")
	}
}

func TestSpecEndpoint(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	req := httptest.NewRequest("GET", "/api/spec", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); ct != "application/json" {
		t.Errorf("content-type = %q", ct)
	}

	var parsed spec.BridgeSpec
	if err := json.Unmarshal(w.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if parsed.Version != spec.Version {
		t.Errorf("version = %q", parsed.Version)
	}
	if len(parsed.Projects) != 1 {
		t.Errorf("projects = %d, want 1", len(parsed.Projects))
	}
}

func TestProjectsEndpoint(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	req := httptest.NewRequest("GET", "/api/projects", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if w.Code != 200 {
		t.Fatalf("status = %d, want 200", w.Code)
	}

	var projects []spec.Project
	if err := json.Unmarshal(w.Body.Bytes(), &projects); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(projects) != 1 {
		t.Errorf("projects = %d, want 1", len(projects))
	}
}

func TestUpdateSpec(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	newSpec := testSpec()
	newSpec.Projects = append(newSpec.Projects, spec.Project{
		ID:                   "project:code/new",
		Path:                 "/code/new",
		Name:                 "new",
		Kind:                 "git_repo",
		Classification:       "public",
		ClassificationSource: "remote",
		Languages:            []string{},
		Flags:                []string{},
		Errors:               []spec.ScanErr{},
		PRs:                  []spec.PR{},
		Tasks:                []spec.Task{},
		Subprojects:          []string{},
	})
	srv.SetSpec(newSpec)

	req := httptest.NewRequest("GET", "/api/projects", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	var projects []spec.Project
	json.Unmarshal(w.Body.Bytes(), &projects)

	if len(projects) != 2 {
		t.Errorf("projects = %d, want 2 after update", len(projects))
	}
}

func TestCORSHeader(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	t.Run("reflects localhost origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/health", nil)
		req.Header.Set("Origin", "http://localhost:7401")
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:7401" {
			t.Errorf("CORS header = %q, want http://localhost:7401", got)
		}
	})

	t.Run("reflects 127.0.0.1 origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/health", nil)
		req.Header.Set("Origin", "http://127.0.0.1:7400")
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:7400" {
			t.Errorf("CORS header = %q, want http://127.0.0.1:7400", got)
		}
	})

	t.Run("blocks non-local origin", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/health", nil)
		req.Header.Set("Origin", "https://evil.com")
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("CORS header = %q, want empty for non-local origin", got)
		}
	})

	t.Run("no origin header", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/health", nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)

		if got := w.Header().Get("Access-Control-Allow-Origin"); got != "" {
			t.Errorf("CORS header = %q, want empty when no origin", got)
		}
	})
}

func TestSPAHandler(t *testing.T) {
	dir := t.TempDir()
	os.WriteFile(filepath.Join(dir, "index.html"), []byte("<html>app</html>"), 0644)
	os.MkdirAll(filepath.Join(dir, "assets"), 0755)
	os.WriteFile(filepath.Join(dir, "assets", "main.js"), []byte("console.log('hi')"), 0644)

	srv := New(0, WithWebDir(dir))
	srv.SetSpec(testSpec())

	t.Run("serves index at root", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/", nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if body := w.Body.String(); body != "<html>app</html>" {
			t.Errorf("body = %q", body)
		}
	})

	t.Run("serves static asset", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/assets/main.js", nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if body := w.Body.String(); body != "console.log('hi')" {
			t.Errorf("body = %q", body)
		}
	})

	t.Run("falls back to index for SPA routes", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/dashboard/something", nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("status = %d, want 200", w.Code)
		}
		if body := w.Body.String(); !strings.Contains(body, "<html>app</html>") {
			t.Errorf("expected index.html fallback, got %q", body)
		}
	})

	t.Run("API still works with webDir", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/health", nil)
		w := httptest.NewRecorder()
		srv.Handler().ServeHTTP(w, req)
		if w.Code != 200 {
			t.Fatalf("status = %d, want 200", w.Code)
		}
	})
}

func TestNoWebDir(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	req := httptest.NewRequest("GET", "/", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if w.Code == 200 {
		t.Error("expected non-200 for / without webDir")
	}
}

func wsConnect(t *testing.T, srv *Server) *websocket.Conn {
	t.Helper()
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)

	wsURL := "ws" + strings.TrimPrefix(ts.URL, "http") + "/ws"
	conn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("ws dial: %v", err)
	}
	t.Cleanup(func() { conn.Close() })
	return conn
}

func TestWSFullSyncOnConnect(t *testing.T) {
	srv := New(0)
	sp := testSpec()
	srv.SetSpec(sp)

	conn := wsConnect(t, srv)

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var envelope struct {
		Type string          `json:"type"`
		Spec json.RawMessage `json:"spec"`
	}
	if err := json.Unmarshal(msg, &envelope); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if envelope.Type != "full_sync" {
		t.Errorf("type = %q, want full_sync", envelope.Type)
	}

	var parsed spec.BridgeSpec
	if err := json.Unmarshal(envelope.Spec, &parsed); err != nil {
		t.Fatalf("unmarshal spec: %v", err)
	}
	if len(parsed.Projects) != 1 {
		t.Errorf("projects = %d, want 1", len(parsed.Projects))
	}
}

func TestWSBroadcastOnSetSpec(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	conn := wsConnect(t, srv)

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	conn.ReadMessage()

	newSpec := testSpec()
	newSpec.Projects = append(newSpec.Projects, spec.Project{
		ID:                   "project:code/ws-test",
		Path:                 "/code/ws-test",
		Name:                 "ws-test",
		Kind:                 "git_repo",
		Classification:       "personal",
		ClassificationSource: "remote",
		Languages:            []string{},
		Flags:                []string{},
		Errors:               []spec.ScanErr{},
		PRs:                  []spec.PR{},
		Tasks:                []spec.Task{},
		Subprojects:          []string{},
	})
	srv.SetSpec(newSpec)

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, msg, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read broadcast: %v", err)
	}

	var envelope struct {
		Type string          `json:"type"`
		Spec json.RawMessage `json:"spec"`
	}
	json.Unmarshal(msg, &envelope)

	if envelope.Type != "full_sync" {
		t.Errorf("type = %q, want full_sync", envelope.Type)
	}

	var parsed spec.BridgeSpec
	json.Unmarshal(envelope.Spec, &parsed)
	if len(parsed.Projects) != 2 {
		t.Errorf("projects = %d, want 2", len(parsed.Projects))
	}
}

func readWSMsg(t *testing.T, conn *websocket.Conn) map[string]interface{} {
	t.Helper()
	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	_, raw, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read ws: %v", err)
	}
	var msg map[string]interface{}
	if err := json.Unmarshal(raw, &msg); err != nil {
		t.Fatalf("unmarshal ws msg: %v", err)
	}
	return msg
}

func sendWSMsg(t *testing.T, conn *websocket.Conn, v interface{}) {
	t.Helper()
	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
		t.Fatalf("write: %v", err)
	}
}

func TestWSSessionsListNoManager(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)

	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "sessions_list_request"})
	msg := readWSMsg(t, conn)

	if msg["type"] != "sessions_list" {
		t.Errorf("type = %v, want sessions_list", msg["type"])
	}
	sessions := msg["sessions"].([]interface{})
	if len(sessions) != 0 {
		t.Errorf("sessions = %d, want 0", len(sessions))
	}
}

func TestWSSessionCreateNoManager(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)

	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{
		"type": "session_create",
		"cwd":  "/tmp",
	})
	msg := readWSMsg(t, conn)

	if msg["type"] != "error" {
		t.Errorf("type = %v, want error", msg["type"])
	}
}

func TestWSSessionDestroyNoManager(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)

	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{
		"type":      "session_destroy",
		"sessionId": "nonexistent",
	})
	msg := readWSMsg(t, conn)

	if msg["type"] != "error" {
		t.Errorf("type = %v, want error", msg["type"])
	}
}

func TestWSBroadcast(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())

	conn := wsConnect(t, srv)
	readWSMsg(t, conn)

	payload, _ := json.Marshal(map[string]string{
		"type":      "pi_event",
		"sessionId": "test-123",
	})
	srv.Broadcast(payload)

	msg := readWSMsg(t, conn)
	if msg["type"] != "pi_event" {
		t.Errorf("type = %v, want pi_event", msg["type"])
	}
	if msg["sessionId"] != "test-123" {
		t.Errorf("sessionId = %v", msg["sessionId"])
	}
}

func TestWSUnknownMessageType(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)

	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "totally_unknown"})

	time.Sleep(100 * time.Millisecond)
}

func TestWSInvalidJSON(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)

	readWSMsg(t, conn)

	conn.WriteMessage(websocket.TextMessage, []byte("not json"))
	msg := readWSMsg(t, conn)

	if msg["type"] != "error" {
		t.Errorf("type = %v, want error", msg["type"])
	}
}

func testConfigServer(t *testing.T) (*Server, *config.Config) {
	t.Helper()
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)
	cfg := config.NewDefault([]string{"/code"})
	cfg.Save()
	srv := New(0, WithConfig(cfg))
	srv.SetSpec(testSpec())
	return srv, cfg
}

func TestWSConfigUpdateOnConnect(t *testing.T) {
	srv, cfg := testConfigServer(t)
	cfg.AddFocusedProject("/code/a")
	cfg.AddPinnedProject("/code/a")

	conn := wsConnect(t, srv)

	readWSMsg(t, conn)
	msg := readWSMsg(t, conn)

	if msg["type"] != "config_update" {
		t.Fatalf("type = %v, want config_update", msg["type"])
	}
	focused := msg["focusedProjects"].([]interface{})
	if len(focused) != 1 || focused[0] != "/code/a" {
		t.Errorf("focusedProjects = %v", focused)
	}
	pinned := msg["pinnedProjects"].([]interface{})
	if len(pinned) != 1 || pinned[0] != "/code/a" {
		t.Errorf("pinnedProjects = %v", pinned)
	}
}

func TestWSProjectOptIn(t *testing.T) {
	srv, cfg := testConfigServer(t)
	conn := wsConnect(t, srv)

	readWSMsg(t, conn)
	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "project_opt_in", "path": "/code/test"})
	msg := readWSMsg(t, conn)

	if msg["type"] != "config_update" {
		t.Fatalf("type = %v, want config_update", msg["type"])
	}
	focused := msg["focusedProjects"].([]interface{})
	if len(focused) != 1 || focused[0] != "/code/test" {
		t.Errorf("focusedProjects = %v", focused)
	}
	if !cfg.HasFocusedProject("/code/test") {
		t.Error("config not updated")
	}
}

func TestWSProjectOptOut(t *testing.T) {
	srv, cfg := testConfigServer(t)
	cfg.AddFocusedProject("/code/test")
	cfg.AddPinnedProject("/code/test")

	conn := wsConnect(t, srv)
	readWSMsg(t, conn)
	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "project_opt_out", "path": "/code/test"})
	msg := readWSMsg(t, conn)

	if msg["type"] != "config_update" {
		t.Fatalf("type = %v, want config_update", msg["type"])
	}
	focused := msg["focusedProjects"].([]interface{})
	if len(focused) != 0 {
		t.Errorf("focusedProjects = %v, want empty", focused)
	}
	pinned := msg["pinnedProjects"].([]interface{})
	if len(pinned) != 0 {
		t.Errorf("pinnedProjects = %v, want empty (cascade)", pinned)
	}
}

func TestWSProjectPin(t *testing.T) {
	srv, _ := testConfigServer(t)
	conn := wsConnect(t, srv)
	readWSMsg(t, conn)
	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "project_pin", "path": "/code/a"})
	msg := readWSMsg(t, conn)

	if msg["type"] != "config_update" {
		t.Fatalf("type = %v, want config_update", msg["type"])
	}
	pinned := msg["pinnedProjects"].([]interface{})
	if len(pinned) != 1 || pinned[0] != "/code/a" {
		t.Errorf("pinnedProjects = %v", pinned)
	}
}

func TestWSProjectUnpin(t *testing.T) {
	srv, cfg := testConfigServer(t)
	cfg.AddPinnedProject("/code/a")

	conn := wsConnect(t, srv)
	readWSMsg(t, conn)
	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "project_unpin", "path": "/code/a"})
	msg := readWSMsg(t, conn)

	if msg["type"] != "config_update" {
		t.Fatalf("type = %v, want config_update", msg["type"])
	}
	pinned := msg["pinnedProjects"].([]interface{})
	if len(pinned) != 0 {
		t.Errorf("pinnedProjects = %v, want empty", pinned)
	}
}

func TestWSProjectOptInNoConfig(t *testing.T) {
	srv := New(0)
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)
	readWSMsg(t, conn)

	sendWSMsg(t, conn, map[string]string{"type": "project_opt_in", "path": "/code/a"})
	msg := readWSMsg(t, conn)

	if msg["type"] != "error" {
		t.Errorf("type = %v, want error", msg["type"])
	}
}

func TestWSProjectOptInBroadcastToAll(t *testing.T) {
	srv, _ := testConfigServer(t)

	conn1 := wsConnect(t, srv)
	readWSMsg(t, conn1)
	readWSMsg(t, conn1)

	conn2 := wsConnect(t, srv)
	readWSMsg(t, conn2)
	readWSMsg(t, conn2)

	sendWSMsg(t, conn1, map[string]string{"type": "project_opt_in", "path": "/code/x"})

	msg1 := readWSMsg(t, conn1)
	if msg1["type"] != "config_update" {
		t.Errorf("conn1 type = %v, want config_update", msg1["type"])
	}

	msg2 := readWSMsg(t, conn2)
	if msg2["type"] != "config_update" {
		t.Errorf("conn2 type = %v, want config_update", msg2["type"])
	}
}

func TestWSProjectSearch(t *testing.T) {
	index := []RepoEntry{
		{Name: "bridge", Path: "/code/bridge"},
		{Name: "dotfiles", Path: "/code/dotfiles"},
		{Name: "my-app", Path: "/work/my-app"},
	}
	srv := New(0, WithRepoIndex(index))
	srv.SetSpec(testSpec())
	conn := wsConnect(t, srv)
	readWSMsg(t, conn)

	t.Run("matches by name", func(t *testing.T) {
		sendWSMsg(t, conn, map[string]string{"type": "project_search", "query": "bridge"})
		msg := readWSMsg(t, conn)

		if msg["type"] != "project_search_results" {
			t.Fatalf("type = %v, want project_search_results", msg["type"])
		}
		results := msg["results"].([]interface{})
		if len(results) != 1 {
			t.Fatalf("results = %d, want 1", len(results))
		}
		r := results[0].(map[string]interface{})
		if r["name"] != "bridge" {
			t.Errorf("name = %v", r["name"])
		}
	})

	t.Run("matches by path", func(t *testing.T) {
		sendWSMsg(t, conn, map[string]string{"type": "project_search", "query": "/work/"})
		msg := readWSMsg(t, conn)

		results := msg["results"].([]interface{})
		if len(results) != 1 {
			t.Fatalf("results = %d, want 1", len(results))
		}
		r := results[0].(map[string]interface{})
		if r["name"] != "my-app" {
			t.Errorf("name = %v", r["name"])
		}
	})

	t.Run("empty query returns all", func(t *testing.T) {
		sendWSMsg(t, conn, map[string]string{"type": "project_search", "query": ""})
		msg := readWSMsg(t, conn)

		results := msg["results"].([]interface{})
		if len(results) != 3 {
			t.Errorf("results = %d, want 3", len(results))
		}
	})

	t.Run("no match returns empty array", func(t *testing.T) {
		sendWSMsg(t, conn, map[string]string{"type": "project_search", "query": "zzzznothing"})
		msg := readWSMsg(t, conn)

		results := msg["results"].([]interface{})
		if len(results) != 0 {
			t.Errorf("results = %d, want 0", len(results))
		}
	})

	t.Run("case insensitive", func(t *testing.T) {
		sendWSMsg(t, conn, map[string]string{"type": "project_search", "query": "BRIDGE"})
		msg := readWSMsg(t, conn)

		results := msg["results"].([]interface{})
		if len(results) != 1 {
			t.Errorf("results = %d, want 1", len(results))
		}
	})
}
