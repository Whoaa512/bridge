package discover

import (
	"os"
	"path/filepath"
	"strings"
)

type Project struct {
	Path           string
	Name           string
	Kind           string // git_repo, directory, monorepo_child
	IsGit          bool
	HasInfra       bool
	MonorepoChildren []string
}

type WalkResult struct {
	Projects []Project
	Errors   []error
}

func Walk(scanRoots []string, ignore []string) WalkResult {
	var result WalkResult
	seen := make(map[string]bool)

	for _, root := range scanRoots {
		root = expandHome(root)
		walkRoot(root, ignore, seen, &result)
	}

	return result
}

func walkRoot(root string, ignore []string, seen map[string]bool, result *WalkResult) {
	real, err := filepath.EvalSymlinks(root)
	if err != nil {
		result.Errors = append(result.Errors, err)
		return
	}

	info, err := os.Stat(real)
	if err != nil {
		result.Errors = append(result.Errors, err)
		return
	}
	if !info.IsDir() {
		return
	}

	walkDir(real, root, ignore, seen, result)
}

func walkDir(dir string, scanRoot string, ignore []string, seen map[string]bool, result *WalkResult) {
	real, err := filepath.EvalSymlinks(dir)
	if err != nil {
		result.Errors = append(result.Errors, err)
		return
	}

	if seen[real] {
		return
	}
	seen[real] = true

	if isGitRepo(dir) {
		p := Project{
			Path:  dir,
			Name:  filepath.Base(dir),
			Kind:  "git_repo",
			IsGit: true,
		}

		if hasInfraProject(dir) {
			p.HasInfra = true
		}

		children := detectMonorepoChildren(dir, ignore, seen)
		p.MonorepoChildren = children

		result.Projects = append(result.Projects, p)
		return
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		result.Errors = append(result.Errors, err)
		return
	}

	for _, entry := range entries {
		name := entry.Name()
		if shouldIgnore(name, ignore) {
			continue
		}

		child := filepath.Join(dir, name)

		info, err := entry.Info()
		if err != nil {
			result.Errors = append(result.Errors, err)
			continue
		}

		if info.Mode()&os.ModeSymlink != 0 {
			resolved, err := filepath.EvalSymlinks(child)
			if err != nil {
				result.Errors = append(result.Errors, err)
				continue
			}
			child = resolved
		}

		fi, err := os.Stat(child)
		if err != nil {
			result.Errors = append(result.Errors, err)
			continue
		}

		if !fi.IsDir() {
			continue
		}

		walkDir(child, scanRoot, ignore, seen, result)
	}
}

func isGitRepo(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, ".git"))
	if err != nil {
		return false
	}
	return info.IsDir() || info.Mode().IsRegular()
}

func hasInfraProject(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "_infra", "project.yml"))
	return err == nil
}

func shouldIgnore(name string, patterns []string) bool {
	if strings.HasPrefix(name, ".") {
		return true
	}
	for _, p := range patterns {
		if matched, _ := filepath.Match(p, name); matched {
			return true
		}
	}
	return false
}

func expandHome(path string) string {
	if !strings.HasPrefix(path, "~/") {
		return path
	}
	home, _ := os.UserHomeDir()
	return home + path[1:]
}
