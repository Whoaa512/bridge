package server

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/spec"
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

	req := httptest.NewRequest("GET", "/api/health", nil)
	w := httptest.NewRecorder()
	srv.Handler().ServeHTTP(w, req)

	if got := w.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Errorf("CORS header = %q, want *", got)
	}
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
