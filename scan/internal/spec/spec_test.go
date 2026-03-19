package spec

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestEmitCreatesValidJSON(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	now := time.Now().UTC().Truncate(time.Second)
	s := &BridgeSpec{
		Version:   Version,
		ScannedAt: now,
		Machine:   Machine{Hostname: "test", OS: "darwin", Uptime: 1000},
		Projects:  []Project{},
		Infrastructure: Infrastructure{
			Ports:  []Port{},
			Docker: []DockerContainer{},
			Resources: Resources{
				CPUByProject: map[string]float64{},
				MemByProject: map[string]int64{},
			},
		},
		Alerts: []Alert{},
		Cycle: Cycle{
			Period:  "daily",
			Start:   now.Add(-24 * time.Hour),
			End:     now,
			Summary: CycleSummary{},
		},
	}

	if err := Emit(s); err != nil {
		t.Fatalf("Emit: %v", err)
	}

	path := filepath.Join(tmp, ".bridge", "spec.json")
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("stat spec.json: %v", err)
	}

	if info.Mode().Perm() != 0600 {
		t.Errorf("expected mode 0600, got %o", info.Mode().Perm())
	}

	data, _ := os.ReadFile(path)
	var parsed BridgeSpec
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if parsed.Version != Version {
		t.Errorf("version = %q, want %q", parsed.Version, Version)
	}
	if parsed.Machine.Hostname != "test" {
		t.Errorf("hostname = %q, want %q", parsed.Machine.Hostname, "test")
	}
}

func TestFileLockExclusive(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	lock1, err := AcquireLock()
	if err != nil {
		t.Fatalf("first lock: %v", err)
	}
	defer lock1.Release()

	_, err = AcquireLock()
	if err == nil {
		t.Fatal("expected second lock to fail")
	}
}

func TestFileLockRelease(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	lock1, err := AcquireLock()
	if err != nil {
		t.Fatalf("first lock: %v", err)
	}
	lock1.Release()

	lock2, err := AcquireLock()
	if err != nil {
		t.Fatalf("second lock after release: %v", err)
	}
	lock2.Release()
}
