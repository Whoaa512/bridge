package integration

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/cjwinslow/bridge/scan/internal/config"
	"github.com/cjwinslow/bridge/scan/internal/discover"
	"github.com/cjwinslow/bridge/scan/internal/spec"
	"github.com/santhosh-tekuri/jsonschema/v6"
)

func makeGitRepo(t *testing.T, dir string, files map[string]string) {
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

func TestIntegrationScan(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	scanRoot := filepath.Join(tmp, "code")
	os.MkdirAll(scanRoot, 0755)

	makeGitRepo(t, filepath.Join(scanRoot, "public-project"), map[string]string{
		"README.md": "hello",
	})

	makeGitRepo(t, filepath.Join(scanRoot, "internal-project"), map[string]string{
		"README.md":             "hello",
		"_infra/project.yml":    "name: internal-project",
	})

	makeGitRepo(t, filepath.Join(scanRoot, "monorepo"), map[string]string{
		"package.json":          `{"workspaces":["packages/*"]}`,
		"packages/ui/index.js":  "// ui",
		"packages/api/index.js": "// api",
	})

	os.MkdirAll(filepath.Join(scanRoot, "not-a-project"), 0755)
	os.WriteFile(filepath.Join(scanRoot, "not-a-project", "random.txt"), []byte("hi"), 0644)

	cfg := config.NewDefault([]string{scanRoot})
	s := discover.BuildSpec(cfg, nil)

	if s.Version != spec.Version {
		t.Errorf("version = %q, want %q", s.Version, spec.Version)
	}

	if s.ScannedAt.IsZero() {
		t.Error("scannedAt should not be zero")
	}

	if s.Machine.Hostname == "" {
		t.Error("hostname should not be empty")
	}

	projectsByID := map[string]spec.Project{}
	for _, p := range s.Projects {
		projectsByID[p.ID] = p
	}

	pub, ok := projectsByID["project:code/public-project"]
	if !ok {
		t.Fatal("missing public-project")
	}
	if pub.Kind != "git_repo" {
		t.Errorf("public-project kind = %q", pub.Kind)
	}
	if pub.Git == nil {
		t.Error("public-project should have git stats")
	}
	if pub.Git != nil && pub.Git.Branch != "main" {
		t.Errorf("branch = %q, want main", pub.Git.Branch)
	}

	intern, ok := projectsByID["project:code/internal-project"]
	if !ok {
		t.Fatal("missing internal-project")
	}
	if intern.Classification != "internal" {
		t.Errorf("internal-project classification = %q, want internal", intern.Classification)
	}
	if intern.ClassificationSource != "infra" {
		t.Errorf("classificationSource = %q, want infra", intern.ClassificationSource)
	}

	mono, ok := projectsByID["project:code/monorepo"]
	if !ok {
		t.Fatal("missing monorepo")
	}
	if len(mono.Subprojects) != 2 {
		t.Errorf("monorepo subprojects = %d, want 2", len(mono.Subprojects))
	}

	hasMonoFlag := false
	for _, f := range mono.Flags {
		if f == "monorepo" {
			hasMonoFlag = true
		}
	}
	if !hasMonoFlag {
		t.Error("monorepo should have 'monorepo' flag")
	}

	if _, ok := projectsByID["project:code/not-a-project"]; ok {
		t.Error("not-a-project should not be discovered")
	}

	if len(s.Infrastructure.Ports) != 0 {
		t.Error("ports should be empty at M0")
	}
	if len(s.Alerts) != 0 {
		t.Error("alerts should be empty at M0")
	}

	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	if !json.Valid(data) {
		t.Error("spec is not valid JSON")
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, field := range []string{"version", "scannedAt", "machine", "projects", "infrastructure", "alerts", "cycle"} {
		if _, ok := parsed[field]; !ok {
			t.Errorf("missing required field: %s", field)
		}
	}
}

func TestIntegrationErrorsArray(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	scanRoot := filepath.Join(tmp, "code")
	dir := filepath.Join(scanRoot, "broken")
	os.MkdirAll(filepath.Join(dir, ".git"), 0755)

	cfg := config.NewDefault([]string{scanRoot})
	s := discover.BuildSpec(cfg, nil)

	if len(s.Projects) != 1 {
		t.Fatalf("expected 1 project, got %d", len(s.Projects))
	}

	p := s.Projects[0]
	if len(p.Errors) == 0 {
		t.Error("broken git repo should have errors")
	}
	if p.Git != nil {
		t.Error("broken git repo should have nil git stats")
	}
}

func TestIntegrationSpecEmission(t *testing.T) {
	tmp := t.TempDir()
	t.Setenv("HOME", tmp)

	scanRoot := filepath.Join(tmp, "code")
	makeGitRepo(t, filepath.Join(scanRoot, "simple"), map[string]string{
		"main.go": "package main",
	})

	cfg := config.NewDefault([]string{scanRoot})
	s := discover.BuildSpec(cfg, nil)

	if err := spec.Emit(s); err != nil {
		t.Fatalf("Emit: %v", err)
	}

	specPath := filepath.Join(tmp, ".bridge", "spec.json")
	data, err := os.ReadFile(specPath)
	if err != nil {
		t.Fatalf("read spec: %v", err)
	}

	var loaded spec.BridgeSpec
	if err := json.Unmarshal(data, &loaded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	if loaded.Version != spec.Version {
		t.Errorf("loaded version = %q", loaded.Version)
	}
	if len(loaded.Projects) != 1 {
		t.Errorf("loaded projects = %d, want 1", len(loaded.Projects))
	}
}

func schemaPath(t *testing.T) string {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Join(filepath.Dir(thisFile), "..", "..", "..", "spec", "bridge-spec.schema.json")
}

func validateSpecAgainstSchema(t *testing.T, s *spec.BridgeSpec) {
	t.Helper()

	data, err := json.Marshal(s)
	if err != nil {
		t.Fatalf("marshal spec: %v", err)
	}

	var inst any
	if err := json.Unmarshal(data, &inst); err != nil {
		t.Fatalf("unmarshal to any: %v", err)
	}

	sp := schemaPath(t)
	c := jsonschema.NewCompiler()
	sch, err := c.Compile(sp)
	if err != nil {
		t.Fatalf("compile schema: %v", err)
	}

	if err := sch.Validate(inst); err != nil {
		t.Fatalf("schema validation failed:\n%v", err)
	}
}

func TestSpecValidatesAgainstSchema(t *testing.T) {
	t.Run("simple_repo", func(t *testing.T) {
		tmp := t.TempDir()
		t.Setenv("HOME", tmp)

		scanRoot := filepath.Join(tmp, "code")
		makeGitRepo(t, filepath.Join(scanRoot, "myproject"), map[string]string{
			"main.go": "package main",
		})

		cfg := config.NewDefault([]string{scanRoot})
		s := discover.BuildSpec(cfg, nil)
		validateSpecAgainstSchema(t, s)
	})

	t.Run("monorepo_and_broken_git", func(t *testing.T) {
		tmp := t.TempDir()
		t.Setenv("HOME", tmp)

		scanRoot := filepath.Join(tmp, "code")

		makeGitRepo(t, filepath.Join(scanRoot, "mono"), map[string]string{
			"package.json":          `{"workspaces":["packages/*"]}`,
			"packages/ui/index.js":  "// ui",
			"packages/api/index.js": "// api",
		})

		broken := filepath.Join(scanRoot, "broken")
		os.MkdirAll(filepath.Join(broken, ".git"), 0755)

		cfg := config.NewDefault([]string{scanRoot})
		s := discover.BuildSpec(cfg, nil)

		hasMono := false
		hasBroken := false
		for _, p := range s.Projects {
			if p.Kind == "monorepo_child" {
				hasMono = true
			}
			if len(p.Errors) > 0 {
				hasBroken = true
			}
		}
		if !hasMono {
			t.Error("expected at least one monorepo_child project")
		}
		if !hasBroken {
			t.Error("expected at least one project with errors")
		}

		validateSpecAgainstSchema(t, s)
	})
}
