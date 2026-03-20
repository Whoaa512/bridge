package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestManifestAddAndLoad(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sessions", "active.json")
	m := NewManifest(path)

	if err := m.Add(ManifestEntry{ID: "s1", CWD: "/tmp", Model: "gpt", ProjectID: "p1", CreatedAt: "2024-01-01T00:00:00Z"}); err != nil {
		t.Fatalf("add: %v", err)
	}
	if err := m.Add(ManifestEntry{ID: "s2", CWD: "/tmp2", Model: "claude", ProjectID: "p2", CreatedAt: "2024-01-01T00:01:00Z"}); err != nil {
		t.Fatalf("add: %v", err)
	}

	m2 := NewManifest(path)
	entries, err := m2.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(entries))
	}

	ids := map[string]bool{}
	for _, e := range entries {
		ids[e.ID] = true
	}
	if !ids["s1"] || !ids["s2"] {
		t.Errorf("missing entries: %v", ids)
	}
}

func TestManifestRemove(t *testing.T) {
	path := filepath.Join(t.TempDir(), "active.json")
	m := NewManifest(path)

	m.Add(ManifestEntry{ID: "s1", CWD: "/tmp"})
	m.Add(ManifestEntry{ID: "s2", CWD: "/tmp"})

	if err := m.Remove("s1"); err != nil {
		t.Fatalf("remove: %v", err)
	}

	entries, err := m.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}
	if entries[0].ID != "s2" {
		t.Errorf("remaining entry = %q, want s2", entries[0].ID)
	}
}

func TestManifestClear(t *testing.T) {
	path := filepath.Join(t.TempDir(), "active.json")
	m := NewManifest(path)

	m.Add(ManifestEntry{ID: "s1", CWD: "/tmp"})
	m.Add(ManifestEntry{ID: "s2", CWD: "/tmp"})

	if err := m.Clear(); err != nil {
		t.Fatalf("clear: %v", err)
	}

	entries, err := m.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("entries = %d, want 0", len(entries))
	}
}

func TestManifestLoadEmpty(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nonexistent.json")
	m := NewManifest(path)

	entries, err := m.Load()
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(entries) != 0 {
		t.Errorf("entries = %d, want 0", len(entries))
	}
}

func TestManifestAtomicWrite(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "active.json")
	m := NewManifest(path)

	m.Add(ManifestEntry{ID: "s1", CWD: "/tmp"})

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var entries []ManifestEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if len(entries) != 1 || entries[0].ID != "s1" {
		t.Errorf("unexpected content: %s", data)
	}

	tmp := path + ".tmp"
	if _, err := os.Stat(tmp); !os.IsNotExist(err) {
		t.Error("temp file should not persist after atomic write")
	}
}
