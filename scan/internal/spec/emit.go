package spec

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

func BridgeDir() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".bridge")
}

func SpecPath() string {
	return filepath.Join(BridgeDir(), "spec.json")
}

func LockPath() string {
	return filepath.Join(BridgeDir(), ".lock")
}

func EnsureDir() error {
	return os.MkdirAll(BridgeDir(), 0700)
}

func Emit(s *BridgeSpec) error {
	if err := EnsureDir(); err != nil {
		return fmt.Errorf("create bridge dir: %w", err)
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal spec: %w", err)
	}

	tmp, err := os.CreateTemp(BridgeDir(), "spec-*.json")
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}
	tmpName := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpName)
		return fmt.Errorf("write temp file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("close temp file: %w", err)
	}

	if err := os.Chmod(tmpName, 0600); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("chmod temp file: %w", err)
	}

	if err := os.Rename(tmpName, SpecPath()); err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("atomic rename: %w", err)
	}

	return nil
}
