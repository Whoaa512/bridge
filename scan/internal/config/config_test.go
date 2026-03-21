package config

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/spec"
)

func TestOnboarding(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	input := strings.NewReader("~/code, ~/work\nextra-dir\n")
	var output bytes.Buffer

	cfg, err := RunOnboarding(input, &output)
	if err != nil {
		t.Fatalf("RunOnboarding: %v", err)
	}

	home := tmp
	if len(cfg.ScanRoots) != 2 {
		t.Fatalf("expected 2 scan roots, got %d", len(cfg.ScanRoots))
	}
	if cfg.ScanRoots[0] != filepath.Join(home, "code") {
		t.Errorf("root[0] = %q, want %q", cfg.ScanRoots[0], filepath.Join(home, "code"))
	}
	if cfg.ScanRoots[1] != filepath.Join(home, "work") {
		t.Errorf("root[1] = %q, want %q", cfg.ScanRoots[1], filepath.Join(home, "work"))
	}

	found := false
	for _, ig := range cfg.Ignore {
		if ig == "extra-dir" {
			found = true
			break
		}
	}
	if !found {
		t.Error("expected 'extra-dir' in ignore list")
	}

	if _, err := os.Stat(filepath.Join(tmp, ".bridge", "config.json")); err != nil {
		t.Fatalf("config.json not saved: %v", err)
	}
}

func TestOnboardingNoRoots(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	input := strings.NewReader("\n")
	var output bytes.Buffer

	_, err := RunOnboarding(input, &output)
	if err == nil {
		t.Fatal("expected error when no roots provided")
	}
}

func TestLoadSave(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	cfg := NewDefault([]string{"/code"})
	if err := cfg.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if len(loaded.ScanRoots) != 1 || loaded.ScanRoots[0] != "/code" {
		t.Errorf("loaded roots = %v, want [/code]", loaded.ScanRoots)
	}
}

func TestExists(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	if Exists() {
		t.Error("expected Exists() = false before save")
	}

	cfg := NewDefault([]string{"/code"})
	cfg.Save()

	if !Exists() {
		t.Error("expected Exists() = true after save")
	}
}

func TestFocusedProjects(t *testing.T) {
	cfg := NewDefault([]string{"/code"})

	if cfg.HasFocusedProject("project:a") {
		t.Error("expected false for empty focused")
	}

	cfg.AddFocusedProject("project:a")
	if !cfg.HasFocusedProject("project:a") {
		t.Error("expected true after add")
	}

	cfg.AddFocusedProject("project:a")
	if len(cfg.FocusedProjects) != 1 {
		t.Errorf("duplicate add: got %d, want 1", len(cfg.FocusedProjects))
	}

	cfg.AddFocusedProject("project:b")
	if len(cfg.FocusedProjects) != 2 {
		t.Errorf("got %d, want 2", len(cfg.FocusedProjects))
	}

	cfg.RemoveFocusedProject("project:a")
	if cfg.HasFocusedProject("project:a") {
		t.Error("expected false after remove")
	}
	if len(cfg.FocusedProjects) != 1 {
		t.Errorf("got %d, want 1", len(cfg.FocusedProjects))
	}
}

func TestPinnedProjects(t *testing.T) {
	cfg := NewDefault([]string{"/code"})

	if cfg.HasPinnedProject("project:a") {
		t.Error("expected false for empty pinned")
	}

	cfg.AddPinnedProject("project:a")
	if !cfg.HasPinnedProject("project:a") {
		t.Error("expected true after add")
	}

	cfg.AddPinnedProject("project:a")
	if len(cfg.PinnedProjects) != 1 {
		t.Errorf("duplicate add: got %d, want 1", len(cfg.PinnedProjects))
	}

	cfg.RemovePinnedProject("project:a")
	if cfg.HasPinnedProject("project:a") {
		t.Error("expected false after remove")
	}
}

func TestTogglePinProject(t *testing.T) {
	cfg := NewDefault([]string{"/code"})

	cfg.TogglePinProject("project:a")
	if !cfg.HasPinnedProject("project:a") {
		t.Error("expected pinned after first toggle")
	}

	cfg.TogglePinProject("project:a")
	if cfg.HasPinnedProject("project:a") {
		t.Error("expected unpinned after second toggle")
	}
}

func TestRemoveFocusedAlsoRemovesPinned(t *testing.T) {
	cfg := NewDefault([]string{"/code"})

	cfg.AddFocusedProject("project:a")
	cfg.AddPinnedProject("project:a")

	cfg.RemoveFocusedProject("project:a")
	if cfg.HasPinnedProject("project:a") {
		t.Error("expected pinned removed when focused removed")
	}
}

func TestFocusedProjectsPersistence(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	cfg := NewDefault([]string{"/code"})
	cfg.AddFocusedProject("project:a")
	cfg.AddPinnedProject("project:a")
	if err := cfg.Save(); err != nil {
		t.Fatalf("Save: %v", err)
	}

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !loaded.HasFocusedProject("project:a") {
		t.Error("focused project not persisted")
	}
	if !loaded.HasPinnedProject("project:a") {
		t.Error("pinned project not persisted")
	}
}

func TestSeedFocusedProjects(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	now := time.Now()
	recent := now.Add(-3 * 24 * time.Hour)
	stale := now.Add(-30 * 24 * time.Hour)

	projects := []spec.Project{
		{ID: "active-uncommitted", Kind: "standalone", Git: &spec.GitStatus{Uncommitted: 2, LastCommit: stale}},
		{ID: "active-recent", Kind: "standalone", Git: &spec.GitStatus{LastCommit: recent}},
		{ID: "stale-project", Kind: "standalone", Git: &spec.GitStatus{LastCommit: stale}},
		{ID: "mono-child", Kind: "monorepo_child", Git: &spec.GitStatus{Uncommitted: 5, LastCommit: recent}},
		{ID: "no-git", Kind: "standalone"},
	}

	cfg := NewDefault([]string{"/code"})
	cfg.SeedFocusedProjects(projects)

	if len(cfg.FocusedProjects) != 2 {
		t.Fatalf("got %d focused, want 2: %v", len(cfg.FocusedProjects), cfg.FocusedProjects)
	}
	if !cfg.HasFocusedProject("active-uncommitted") {
		t.Error("expected active-uncommitted to be focused")
	}
	if !cfg.HasFocusedProject("active-recent") {
		t.Error("expected active-recent to be focused")
	}
	if cfg.HasFocusedProject("stale-project") {
		t.Error("stale-project should not be focused")
	}
	if cfg.HasFocusedProject("mono-child") {
		t.Error("monorepo_child should not be focused")
	}
	if cfg.HasFocusedProject("no-git") {
		t.Error("no-git should not be focused")
	}
}

func TestSeedFocusedProjectsNoopWhenPopulated(t *testing.T) {
	cfg := NewDefault([]string{"/code"})
	cfg.FocusedProjects = []string{"existing-project"}

	projects := []spec.Project{
		{ID: "active", Kind: "standalone", Git: &spec.GitStatus{Uncommitted: 1}},
	}

	cfg.SeedFocusedProjects(projects)

	if len(cfg.FocusedProjects) != 1 || cfg.FocusedProjects[0] != "existing-project" {
		t.Errorf("seed should be noop when populated, got %v", cfg.FocusedProjects)
	}
}

func TestSeedFocusedProjectsSavesToDisk(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	projects := []spec.Project{
		{ID: "active", Kind: "standalone", Git: &spec.GitStatus{Uncommitted: 1}},
	}

	cfg := NewDefault([]string{"/code"})
	cfg.SeedFocusedProjects(projects)

	loaded, err := Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !loaded.HasFocusedProject("active") {
		t.Error("seeded project not persisted to disk")
	}
}
