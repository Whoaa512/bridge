package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type Config struct {
	SpecVersion     string            `json:"specVersion"`
	ScanRoots       []string          `json:"scanRoots"`
	Ignore          []string          `json:"ignore"`
	Classifications map[string]string `json:"classifications"`
	Priorities      map[string]int    `json:"priorities"`
	Groups          map[string][]string `json:"groups"`
	Services        Services          `json:"services"`
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
	}
}
