package discover

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/git"
	"github.com/cjwinslow/bridge/scan/internal/spec"
)

var sourceExts = map[string]bool{
	".go": true, ".ts": true, ".tsx": true, ".js": true, ".jsx": true,
	".py": true, ".rs": true, ".java": true, ".kt": true, ".rb": true,
	".swift": true, ".c": true, ".cpp": true, ".h": true, ".cs": true,
	".scala": true, ".ex": true, ".exs": true, ".zig": true, ".lua": true,
	".sh": true, ".bash": true, ".zsh": true,
	".md": true, ".json": true, ".yaml": true, ".yml": true, ".toml": true,
}

var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "vendor": true,
	"dist": true, "build": true, "__pycache__": true,
	".next": true, "target": true,
}

func CollectSize(projectPath string, ignores []string) *spec.Size {
	if isGitRepo(projectPath) {
		return collectSizeGit(projectPath, ignores)
	}
	return collectSizeWalk(projectPath, ignores)
}

func collectSizeGit(projectPath string, ignores []string) *spec.Size {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	out, err := git.RunGitCmdContext(ctx, projectPath, "ls-files", "-z")
	if err != nil {
		return collectSizeWalk(projectPath, ignores)
	}

	size := &spec.Size{}
	var sourceFiles []string

	for _, f := range strings.Split(out, "\000") {
		if f == "" {
			continue
		}

		ext := strings.ToLower(filepath.Ext(f))
		if !sourceExts[ext] {
			continue
		}

		if shouldSkipGitFile(f, ignores) {
			continue
		}

		sourceFiles = append(sourceFiles, f)
	}

	size.Files = len(sourceFiles)

	const exactLimit = 500
	const sampleSize = 200

	switch {
	case size.Files <= exactLimit:
		for _, f := range sourceFiles {
			size.LOC += countLines(filepath.Join(projectPath, f))
		}
	case size.Files <= 5000:
		step := size.Files / sampleSize
		if step < 1 {
			step = 1
		}
		sampledLOC := 0
		sampledCount := 0
		for i := 0; i < size.Files; i += step {
			sampledLOC += countLines(filepath.Join(projectPath, sourceFiles[i]))
			sampledCount++
		}
		if sampledCount > 0 {
			size.LOC = int(float64(sampledLOC) / float64(sampledCount) * float64(size.Files))
		}
		size.Approx = true
	default:
		size.LOC = size.Files * 40
		size.Approx = true
	}

	size.Deps = countDeps(projectPath)
	return size
}

func shouldSkipGitFile(relPath string, ignores []string) bool {
	parts := strings.Split(relPath, "/")
	for _, part := range parts[:len(parts)-1] {
		if skipDirs[part] || strings.HasPrefix(part, "bazel-") {
			return true
		}
		for _, ig := range ignores {
			if matched, _ := filepath.Match(ig, part); matched {
				return true
			}
		}
	}
	return false
}

func collectSizeWalk(projectPath string, ignores []string) *spec.Size {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	const maxFiles = 50_000

	size := &spec.Size{}

	err := filepath.Walk(projectPath, func(path string, info os.FileInfo, err error) error {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil {
			return nil
		}

		if size.Files >= maxFiles {
			size.Approx = true
			return filepath.SkipAll
		}

		name := info.Name()

		if info.IsDir() {
			if skipDirs[name] || strings.HasPrefix(name, "bazel-") {
				return filepath.SkipDir
			}
			for _, ig := range ignores {
				if matched, _ := filepath.Match(ig, name); matched {
					return filepath.SkipDir
				}
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(name))
		if !sourceExts[ext] {
			return nil
		}

		size.Files++
		size.LOC += countLines(path)
		return nil
	})

	if err != nil && err != context.DeadlineExceeded {
		if size.Files == 0 && size.LOC == 0 {
			return size
		}
		size.Approx = true
	}
	if err == context.DeadlineExceeded {
		size.Approx = true
	}

	size.Deps = countDeps(projectPath)
	return size
}

func countLines(path string) int {
	f, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer f.Close()

	buf := make([]byte, 32*1024)
	count := 0
	for {
		n, err := f.Read(buf)
		for i := 0; i < n; i++ {
			if buf[i] == '\n' {
				count++
			}
		}
		if err != nil {
			break
		}
	}
	return count
}

func countDeps(projectPath string) int {
	total := 0
	total += countPackageJSONDeps(projectPath)
	total += countGoModDeps(projectPath)
	total += countCargoDeps(projectPath)
	total += countRequirementsDeps(projectPath)
	total += countGemfileDeps(projectPath)
	return total
}

func countPackageJSONDeps(dir string) int {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return 0
	}

	count := 0
	content := string(data)
	inDeps := false
	depth := 0

	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(trimmed, `"dependencies"`) || strings.Contains(trimmed, `"devDependencies"`) {
			inDeps = true
			depth = 0
			if strings.Contains(trimmed, "{") {
				depth++
			}
			continue
		}
		if inDeps {
			if strings.Contains(trimmed, "{") {
				depth++
			}
			if strings.Contains(trimmed, "}") {
				depth--
				if depth <= 0 {
					inDeps = false
				}
				continue
			}
			if depth > 0 && strings.Contains(trimmed, ":") {
				count++
			}
		}
	}
	return count
}

func countGoModDeps(dir string) int {
	data, err := os.ReadFile(filepath.Join(dir, "go.mod"))
	if err != nil {
		return 0
	}

	count := 0
	inRequire := false
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "require (") || trimmed == "require (" {
			inRequire = true
			continue
		}
		if inRequire {
			if trimmed == ")" {
				inRequire = false
				continue
			}
			if trimmed != "" && !strings.HasPrefix(trimmed, "//") {
				count++
			}
		}
		if strings.HasPrefix(trimmed, "require ") && !strings.Contains(trimmed, "(") {
			count++
		}
	}
	return count
}

func countCargoDeps(dir string) int {
	data, err := os.ReadFile(filepath.Join(dir, "Cargo.toml"))
	if err != nil {
		return 0
	}

	count := 0
	inDeps := false
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "[dependencies]" || trimmed == "[dev-dependencies]" || trimmed == "[build-dependencies]" {
			inDeps = true
			continue
		}
		if strings.HasPrefix(trimmed, "[") {
			inDeps = false
			continue
		}
		if inDeps && trimmed != "" && !strings.HasPrefix(trimmed, "#") && strings.Contains(trimmed, "=") {
			count++
		}
	}
	return count
}

func countRequirementsDeps(dir string) int {
	data, err := os.ReadFile(filepath.Join(dir, "requirements.txt"))
	if err != nil {
		return 0
	}

	count := 0
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" && !strings.HasPrefix(trimmed, "#") && !strings.HasPrefix(trimmed, "-") {
			count++
		}
	}
	return count
}

func countGemfileDeps(dir string) int {
	data, err := os.ReadFile(filepath.Join(dir, "Gemfile"))
	if err != nil {
		return 0
	}

	count := 0
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "gem ") || strings.HasPrefix(trimmed, "gem(") {
			count++
		}
	}
	return count
}
