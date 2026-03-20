package agent

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type ManifestEntry struct {
	ID        string `json:"id"`
	CWD       string `json:"cwd"`
	Model     string `json:"model"`
	ProjectID string `json:"projectId"`
	CreatedAt string `json:"createdAt"`
}

type Manifest struct {
	mu      sync.Mutex
	path    string
	entries map[string]ManifestEntry
}

func NewManifest(path string) *Manifest {
	return &Manifest{
		path:    path,
		entries: make(map[string]ManifestEntry),
	}
}

func (m *Manifest) Add(entry ManifestEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries[entry.ID] = entry
	return m.writeLocked()
}

func (m *Manifest) Remove(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.entries, id)
	return m.writeLocked()
}

func (m *Manifest) Load() ([]ManifestEntry, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var entries []ManifestEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		os.Remove(m.path)
		return nil, nil
	}

	m.entries = make(map[string]ManifestEntry, len(entries))
	for _, e := range entries {
		m.entries[e.ID] = e
	}
	return entries, nil
}

func (m *Manifest) Clear() error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries = make(map[string]ManifestEntry)
	return m.writeLocked()
}

func (m *Manifest) writeLocked() error {
	if err := os.MkdirAll(filepath.Dir(m.path), 0700); err != nil {
		return err
	}

	entries := make([]ManifestEntry, 0, len(m.entries))
	for _, e := range m.entries {
		entries = append(entries, e)
	}

	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}

	tmp := m.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0600); err != nil {
		return err
	}
	return os.Rename(tmp, m.path)
}
