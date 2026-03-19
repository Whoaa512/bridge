package discover

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCollectSize_CountsFilesAndLines(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "main.go"), "package main\n\nfunc main() {\n}\n")
	writeFile(t, filepath.Join(dir, "util.ts"), "export const x = 1\nexport const y = 2\n")

	size := CollectSize(dir, nil)
	if size == nil {
		t.Fatal("expected non-nil size")
	}
	if size.Files != 2 {
		t.Errorf("files: got %d, want 2", size.Files)
	}
	if size.LOC != 6 {
		t.Errorf("loc: got %d, want 6", size.LOC)
	}
}

func TestCollectSize_SkipsNodeModules(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "index.js"), "console.log('hi')\n")
	os.MkdirAll(filepath.Join(dir, "node_modules", "dep"), 0o755)
	writeFile(t, filepath.Join(dir, "node_modules", "dep", "index.js"), "module.exports = {}\n")

	size := CollectSize(dir, nil)
	if size.Files != 1 {
		t.Errorf("files: got %d, want 1 (node_modules should be skipped)", size.Files)
	}
}

func TestCollectSize_SkipsBazelDirs(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "main.go"), "package main\n")
	os.MkdirAll(filepath.Join(dir, "bazel-out"), 0o755)
	writeFile(t, filepath.Join(dir, "bazel-out", "gen.go"), "package gen\n")

	size := CollectSize(dir, nil)
	if size.Files != 1 {
		t.Errorf("files: got %d, want 1 (bazel-out should be skipped)", size.Files)
	}
}

func TestCollectSize_CountsPackageJSONDeps(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "package.json"), `{
  "dependencies": {
    "react": "^18.0.0",
    "next": "^14.0.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0"
  }
}`)

	size := CollectSize(dir, nil)
	if size.Deps != 3 {
		t.Errorf("deps: got %d, want 3", size.Deps)
	}
}

func TestCollectSize_CountsGoModDeps(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "go.mod"), `module example.com/test

go 1.21

require (
	github.com/foo/bar v1.0.0
	github.com/baz/qux v2.0.0
)
`)

	size := CollectSize(dir, nil)
	if size.Deps != 2 {
		t.Errorf("deps: got %d, want 2", size.Deps)
	}
}

func TestCollectSize_EmptyDir(t *testing.T) {
	dir := t.TempDir()

	size := CollectSize(dir, nil)
	if size == nil {
		t.Fatal("expected non-nil size for empty dir")
	}
	if size.Files != 0 || size.LOC != 0 || size.Deps != 0 {
		t.Errorf("expected all zeros, got files=%d loc=%d deps=%d", size.Files, size.LOC, size.Deps)
	}
}

func TestCollectSize_IgnoresNonSourceFiles(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "main.go"), "package main\n")
	writeFile(t, filepath.Join(dir, "photo.png"), "not real png data\n")
	writeFile(t, filepath.Join(dir, "data.csv"), "a,b,c\n1,2,3\n")

	size := CollectSize(dir, nil)
	if size.Files != 1 {
		t.Errorf("files: got %d, want 1 (non-source files should be ignored)", size.Files)
	}
}

func TestCollectSize_CustomIgnores(t *testing.T) {
	dir := t.TempDir()

	writeFile(t, filepath.Join(dir, "main.go"), "package main\n")
	os.MkdirAll(filepath.Join(dir, "generated"), 0o755)
	writeFile(t, filepath.Join(dir, "generated", "code.go"), "package gen\n")

	size := CollectSize(dir, []string{"generated"})
	if size.Files != 1 {
		t.Errorf("files: got %d, want 1 (custom ignore should work)", size.Files)
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	os.MkdirAll(filepath.Dir(path), 0o755)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}
