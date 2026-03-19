package discover

import (
	"os"
	"path/filepath"
	"testing"
)

func makeGitRepo(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Join(dir, ".git"), 0755); err != nil {
		t.Fatal(err)
	}
}

func TestWalkFindsGitRepos(t *testing.T) {
	tmp := t.TempDir()

	makeGitRepo(t, filepath.Join(tmp, "projectA"))
	makeGitRepo(t, filepath.Join(tmp, "projectB"))
	os.MkdirAll(filepath.Join(tmp, "not-a-project"), 0755)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 2 {
		t.Fatalf("expected 2 projects, got %d", len(result.Projects))
	}

	names := map[string]bool{}
	for _, p := range result.Projects {
		names[p.Name] = true
		if p.Kind != "git_repo" {
			t.Errorf("project %s kind = %q, want git_repo", p.Name, p.Kind)
		}
	}
	if !names["projectA"] || !names["projectB"] {
		t.Errorf("missing projects: got %v", names)
	}
}

func TestWalkIgnoresPatterns(t *testing.T) {
	tmp := t.TempDir()

	makeGitRepo(t, filepath.Join(tmp, "good-project"))
	makeGitRepo(t, filepath.Join(tmp, "node_modules", "some-dep"))

	result := Walk([]string{tmp}, []string{"node_modules"})

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if result.Projects[0].Name != "good-project" {
		t.Errorf("project = %q, want good-project", result.Projects[0].Name)
	}
}

func TestWalkIgnoresDotDirs(t *testing.T) {
	tmp := t.TempDir()

	makeGitRepo(t, filepath.Join(tmp, "real-project"))
	makeGitRepo(t, filepath.Join(tmp, ".hidden-project"))

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
}

func TestWalkDedupsSymlinks(t *testing.T) {
	tmp := t.TempDir()

	realPath := filepath.Join(tmp, "real")
	makeGitRepo(t, realPath)

	linkPath := filepath.Join(tmp, "link")
	if err := os.Symlink(realPath, linkPath); err != nil {
		t.Skip("symlinks not supported")
	}

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project (deduped), got %d", len(result.Projects))
	}
}

func TestWalkDedupsAcrossRoots(t *testing.T) {
	tmp := t.TempDir()

	repo := filepath.Join(tmp, "code", "project")
	makeGitRepo(t, repo)

	result := Walk([]string{
		filepath.Join(tmp, "code"),
		filepath.Join(tmp, "code"),
	}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project (deduped), got %d", len(result.Projects))
	}
}

func TestWalkDetectsInfra(t *testing.T) {
	tmp := t.TempDir()

	repo := filepath.Join(tmp, "airbnb-project")
	makeGitRepo(t, repo)
	os.MkdirAll(filepath.Join(repo, "_infra"), 0755)
	os.WriteFile(filepath.Join(repo, "_infra", "project.yml"), []byte("name: test"), 0644)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if !result.Projects[0].HasInfra {
		t.Error("expected HasInfra = true")
	}
}

func TestWalkNestedNonGitDirs(t *testing.T) {
	tmp := t.TempDir()

	os.MkdirAll(filepath.Join(tmp, "a", "b", "c"), 0755)
	makeGitRepo(t, filepath.Join(tmp, "a", "b", "c", "deep-project"))

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if result.Projects[0].Name != "deep-project" {
		t.Errorf("name = %q, want deep-project", result.Projects[0].Name)
	}
}

func TestWalkDoesNotRecurseIntoGitRepos(t *testing.T) {
	tmp := t.TempDir()

	outer := filepath.Join(tmp, "mono")
	makeGitRepo(t, outer)

	inner := filepath.Join(outer, "packages", "child")
	makeGitRepo(t, inner)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project (no recurse into git), got %d: %+v", len(result.Projects), result.Projects)
	}
	if result.Projects[0].Name != "mono" {
		t.Errorf("name = %q, want mono", result.Projects[0].Name)
	}
}

func TestNpmWorkspaceDetection(t *testing.T) {
	tmp := t.TempDir()

	mono := filepath.Join(tmp, "mono")
	makeGitRepo(t, mono)

	os.WriteFile(filepath.Join(mono, "package.json"), []byte(`{"workspaces":["packages/*"]}`), 0644)

	pkg := filepath.Join(mono, "packages", "child")
	os.MkdirAll(pkg, 0755)
	os.WriteFile(filepath.Join(pkg, "package.json"), []byte(`{"name":"child"}`), 0644)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if len(result.Projects[0].MonorepoChildren) != 1 {
		t.Fatalf("expected 1 child, got %d", len(result.Projects[0].MonorepoChildren))
	}
}

func TestGoWorkDetection(t *testing.T) {
	tmp := t.TempDir()

	mono := filepath.Join(tmp, "gomono")
	makeGitRepo(t, mono)

	os.WriteFile(filepath.Join(mono, "go.work"), []byte("go 1.21\n\nuse (\n\tserviceA\n\tserviceB\n)\n"), 0644)

	os.MkdirAll(filepath.Join(mono, "serviceA"), 0755)
	os.MkdirAll(filepath.Join(mono, "serviceB"), 0755)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if len(result.Projects[0].MonorepoChildren) != 2 {
		t.Fatalf("expected 2 children, got %d", len(result.Projects[0].MonorepoChildren))
	}
}

func TestCargoWorkspaceDetection(t *testing.T) {
	tmp := t.TempDir()

	mono := filepath.Join(tmp, "rustmono")
	makeGitRepo(t, mono)

	os.WriteFile(filepath.Join(mono, "Cargo.toml"), []byte("[workspace]\nmembers = [\n\"crate-a\",\n\"crate-b\",\n]\n"), 0644)

	os.MkdirAll(filepath.Join(mono, "crate-a"), 0755)
	os.MkdirAll(filepath.Join(mono, "crate-b"), 0755)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if len(result.Projects[0].MonorepoChildren) != 2 {
		t.Fatalf("expected 2 children, got %d: %v", len(result.Projects[0].MonorepoChildren), result.Projects[0].MonorepoChildren)
	}
}

func TestPnpmWorkspaceDetection(t *testing.T) {
	tmp := t.TempDir()

	mono := filepath.Join(tmp, "pnpm-mono")
	makeGitRepo(t, mono)

	os.WriteFile(filepath.Join(mono, "pnpm-workspace.yaml"), []byte("packages:\n  - 'packages/*'\n"), 0644)

	pkg := filepath.Join(mono, "packages", "ui")
	os.MkdirAll(pkg, 0755)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if len(result.Projects[0].MonorepoChildren) != 1 {
		t.Fatalf("expected 1 child, got %d", len(result.Projects[0].MonorepoChildren))
	}
}

func TestLernaDetection(t *testing.T) {
	tmp := t.TempDir()

	mono := filepath.Join(tmp, "lerna-mono")
	makeGitRepo(t, mono)

	os.WriteFile(filepath.Join(mono, "lerna.json"), []byte(`{"packages":["packages/*"]}`), 0644)

	pkg := filepath.Join(mono, "packages", "core")
	os.MkdirAll(pkg, 0755)

	result := Walk([]string{tmp}, nil)

	if len(result.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(result.Projects))
	}
	if len(result.Projects[0].MonorepoChildren) != 1 {
		t.Fatalf("expected 1 child, got %d", len(result.Projects[0].MonorepoChildren))
	}
}
