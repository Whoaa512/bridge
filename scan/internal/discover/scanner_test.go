package discover

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/cjwinslow/bridge/scan/internal/config"
	"github.com/cjwinslow/bridge/scan/internal/spec"
	"github.com/cjwinslow/bridge/scan/internal/watch"
)

func makeGitRepoWithFiles(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}

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

	for name, content := range files {
		p := filepath.Join(dir, name)
		os.MkdirAll(filepath.Dir(p), 0755)
		os.WriteFile(p, []byte(content), 0644)
	}

	run("add", ".")
	run("commit", "-m", "init")
}

func TestBuildSpecWithCache(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	scanRoot := filepath.Join(tmp, "code")
	makeGitRepoWithFiles(t, filepath.Join(scanRoot, "myrepo"), map[string]string{
		"main.go": "package main",
	})

	cfg := config.NewDefault([]string{scanRoot})
	cache := watch.NewCache()

	s1 := BuildSpec(cfg, cache)
	if len(s1.Projects) == 0 {
		t.Fatal("expected projects from first scan")
	}

	if cache.Len() == 0 {
		t.Fatal("cache should be populated after first scan")
	}

	s2 := BuildSpec(cfg, cache)
	if len(s2.Projects) != len(s1.Projects) {
		t.Errorf("cached scan got %d projects, want %d", len(s2.Projects), len(s1.Projects))
	}

	for i, p := range s2.Projects {
		if p.ID != s1.Projects[i].ID {
			t.Errorf("project %d: id %q != %q", i, p.ID, s1.Projects[i].ID)
		}
	}
}

func TestBuildSpecCacheInvalidation(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	scanRoot := filepath.Join(tmp, "code")
	repoPath := filepath.Join(scanRoot, "myrepo")
	makeGitRepoWithFiles(t, repoPath, map[string]string{
		"main.go": "package main",
	})

	resolvedRepo, err := filepath.EvalSymlinks(repoPath)
	if err != nil {
		t.Fatal(err)
	}

	cfg := config.NewDefault([]string{scanRoot})
	cache := watch.NewCache()

	BuildSpec(cfg, cache)
	if cache.Len() == 0 {
		t.Fatal("cache should be populated")
	}

	cache.InvalidatePrefix(resolvedRepo)
	if cache.Len() != 0 {
		t.Errorf("cache should be empty after invalidation, got %d", cache.Len())
	}

	s := BuildSpec(cfg, cache)
	if len(s.Projects) == 0 {
		t.Fatal("expected projects after recompute")
	}
	if cache.Len() == 0 {
		t.Fatal("cache should be repopulated after recompute")
	}
}

func TestBuildSpecNilCache(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	scanRoot := filepath.Join(tmp, "code")
	makeGitRepoWithFiles(t, filepath.Join(scanRoot, "myrepo"), map[string]string{
		"main.go": "package main",
	})

	cfg := config.NewDefault([]string{scanRoot})

	s := BuildSpec(cfg, nil)
	if len(s.Projects) == 0 {
		t.Fatal("nil cache should still produce projects")
	}
}

func TestBuildSpecForPaths(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	repo1 := filepath.Join(tmp, "code", "alpha")
	repo2 := filepath.Join(tmp, "code", "beta")
	repo3 := filepath.Join(tmp, "code", "gamma")
	makeGitRepoWithFiles(t, repo1, map[string]string{"main.go": "package main"})
	makeGitRepoWithFiles(t, repo2, map[string]string{"index.js": "console.log('hi')"})
	makeGitRepoWithFiles(t, repo3, map[string]string{"lib.rs": "fn main() {}"})

	cfg := config.NewDefault([]string{filepath.Join(tmp, "code")})

	s := BuildSpecForPaths([]string{repo1, repo3}, cfg, nil)

	if len(s.Projects) != 2 {
		t.Fatalf("expected 2 projects, got %d", len(s.Projects))
	}

	names := map[string]bool{}
	for _, p := range s.Projects {
		names[p.Name] = true
	}
	if !names["alpha"] || !names["gamma"] {
		t.Errorf("expected alpha and gamma, got %v", names)
	}
	if names["beta"] {
		t.Error("beta should not be in focused scan")
	}
}

func TestBuildSpecForPathsSkipsMissing(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	repo := filepath.Join(tmp, "code", "real")
	makeGitRepoWithFiles(t, repo, map[string]string{"main.go": "package main"})

	cfg := config.NewDefault([]string{filepath.Join(tmp, "code")})

	s := BuildSpecForPaths([]string{
		repo,
		filepath.Join(tmp, "code", "nonexistent"),
	}, cfg, nil)

	if len(s.Projects) != 1 {
		t.Fatalf("expected 1 project (missing skipped), got %d", len(s.Projects))
	}
	if s.Projects[0].Name != "real" {
		t.Errorf("expected 'real', got %q", s.Projects[0].Name)
	}
}

func TestBuildSpecForPathsEmpty(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	cfg := config.NewDefault([]string{filepath.Join(tmp, "code")})

	s := BuildSpecForPaths([]string{}, cfg, nil)

	if len(s.Projects) != 0 {
		t.Fatalf("expected 0 projects for empty paths, got %d", len(s.Projects))
	}
	if s.Version != spec.Version {
		t.Errorf("expected version %s, got %s", spec.Version, s.Version)
	}
}

func TestBuildSpecForPathsWithCache(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	repo := filepath.Join(tmp, "code", "cached")
	makeGitRepoWithFiles(t, repo, map[string]string{"main.go": "package main"})

	cfg := config.NewDefault([]string{filepath.Join(tmp, "code")})
	cache := watch.NewCache()

	s1 := BuildSpecForPaths([]string{repo}, cfg, cache)
	if cache.Len() == 0 {
		t.Fatal("cache should be populated after BuildSpecForPaths")
	}

	s2 := BuildSpecForPaths([]string{repo}, cfg, cache)
	if len(s2.Projects) != len(s1.Projects) {
		t.Errorf("cached scan got %d projects, want %d", len(s2.Projects), len(s1.Projects))
	}
}
