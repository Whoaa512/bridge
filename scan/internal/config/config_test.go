package config

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
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
