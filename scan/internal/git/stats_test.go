package git

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

func initTestRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()

	run := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=test",
			"GIT_AUTHOR_EMAIL=test@test.com",
			"GIT_COMMITTER_NAME=test",
			"GIT_COMMITTER_EMAIL=test@test.com",
		)
		out, err := cmd.CombinedOutput()
		if err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}

	run("init")
	run("checkout", "-b", "main")
	os.WriteFile(filepath.Join(dir, "file.txt"), []byte("hello"), 0644)
	run("add", ".")
	run("commit", "-m", "init")

	return dir
}

func TestGetStatsBranch(t *testing.T) {
	dir := initTestRepo(t)

	stats, err := GetStats(dir)
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.Branch != "main" {
		t.Errorf("branch = %q, want main", stats.Branch)
	}
}

func TestGetStatsUncommitted(t *testing.T) {
	dir := initTestRepo(t)

	os.WriteFile(filepath.Join(dir, "new.txt"), []byte("change"), 0644)

	stats, err := GetStats(dir)
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.Uncommitted != 1 {
		t.Errorf("uncommitted = %d, want 1", stats.Uncommitted)
	}
}

func TestGetStatsLastCommit(t *testing.T) {
	dir := initTestRepo(t)

	stats, err := GetStats(dir)
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.LastCommit.IsZero() {
		t.Error("lastCommit should not be zero")
	}
}

func TestGetStatsNoRemote(t *testing.T) {
	dir := initTestRepo(t)

	stats, err := GetStats(dir)
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.RemoteURL != nil {
		t.Errorf("remoteURL = %q, want nil", *stats.RemoteURL)
	}
}

func TestGetStatsStash(t *testing.T) {
	dir := initTestRepo(t)

	os.WriteFile(filepath.Join(dir, "stash.txt"), []byte("stash me"), 0644)
	cmd := exec.Command("git", "-C", dir, "stash", "push", "-u", "-m", "test stash")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("stash: %v\n%s", err, out)
	}

	stats, err := GetStats(dir)
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.StashCount != 1 {
		t.Errorf("stashCount = %d, want 1", stats.StashCount)
	}
}

func TestGetStatsAheadBehindNoRemote(t *testing.T) {
	dir := initTestRepo(t)

	stats, err := GetStats(dir)
	if err != nil {
		t.Fatalf("GetStats: %v", err)
	}

	if stats.Ahead != 0 || stats.Behind != 0 {
		t.Errorf("ahead/behind = %d/%d, want 0/0 (no remote)", stats.Ahead, stats.Behind)
	}
}
