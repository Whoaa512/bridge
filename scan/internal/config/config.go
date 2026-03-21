package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/spec"
)

type Config struct {
	SpecVersion      string              `json:"specVersion"`
	ScanRoots        []string            `json:"scanRoots"`
	Ignore           []string            `json:"ignore"`
	Classifications  map[string]string   `json:"classifications"`
	Priorities       map[string]int      `json:"priorities"`
	Groups           map[string][]string `json:"groups"`
	Services         Services            `json:"services"`
	FocusedProjects  []string            `json:"focusedProjects"`
	PinnedProjects   []string            `json:"pinnedProjects"`
}

type Services struct {
	KnownPorts map[string]string `json:"knownPorts"`
}

var DefaultIgnore = []string{
	"node_modules", ".git", "vendor", "bazel-*",
	"Library", "Applications", ".Trash",
	"Dropbox", "Google Drive", "Downloads",
	"Desktop", "Movies", "Music", "Pictures",
	".cache", ".npm", ".cargo", ".rustup",
	"__pycache__", ".venv", "venv",
}

func ConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".bridge", "config.json")
}

func Load() (*Config, error) {
	data, err := os.ReadFile(ConfigPath())
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	return &cfg, nil
}

func (c *Config) Save() error {
	dir := filepath.Dir(ConfigPath())
	if err := os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigPath(), data, 0600)
}

func Exists() bool {
	_, err := os.Stat(ConfigPath())
	return err == nil
}

func NewDefault(scanRoots []string) *Config {
	return &Config{
		SpecVersion:     "0.1.0",
		ScanRoots:       scanRoots,
		Ignore:          DefaultIgnore,
		Classifications: map[string]string{},
		Priorities:      map[string]int{},
		Groups:          map[string][]string{},
		Services:        Services{KnownPorts: map[string]string{}},
		FocusedProjects: []string{},
		PinnedProjects:  []string{},
	}
}

func (c *Config) HasFocusedProject(id string) bool {
	return slices.Contains(c.FocusedProjects, id)
}

func (c *Config) AddFocusedProject(id string) {
	if c.HasFocusedProject(id) {
		return
	}
	c.FocusedProjects = append(c.FocusedProjects, id)
}

func (c *Config) RemoveFocusedProject(id string) {
	c.FocusedProjects = slices.DeleteFunc(c.FocusedProjects, func(s string) bool { return s == id })
	c.RemovePinnedProject(id)
}

func (c *Config) HasPinnedProject(id string) bool {
	return slices.Contains(c.PinnedProjects, id)
}

func (c *Config) AddPinnedProject(id string) {
	if c.HasPinnedProject(id) {
		return
	}
	c.PinnedProjects = append(c.PinnedProjects, id)
}

func (c *Config) RemovePinnedProject(id string) {
	c.PinnedProjects = slices.DeleteFunc(c.PinnedProjects, func(s string) bool { return s == id })
}

func (c *Config) TogglePinProject(id string) {
	if c.HasPinnedProject(id) {
		c.RemovePinnedProject(id)
		return
	}
	c.AddPinnedProject(id)
}

func (c *Config) SeedFocusedProjects(projects []spec.Project) {
	if len(c.FocusedProjects) > 0 {
		return
	}

	cutoff := time.Now().Add(-14 * 24 * time.Hour)

	for _, p := range projects {
		if p.Kind == "monorepo_child" {
			continue
		}
		if !isActive(p, cutoff) {
			continue
		}
		c.FocusedProjects = append(c.FocusedProjects, p.ID)
	}

	if len(c.FocusedProjects) > 0 {
		c.Save()
	}
}

func isActive(p spec.Project, cutoff time.Time) bool {
	if p.Git == nil {
		return false
	}
	if p.Git.Uncommitted > 0 {
		return true
	}
	return p.Git.LastCommit.After(cutoff)
}
