package discover

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
)

func detectMonorepoChildren(repoDir string, ignore []string, seen map[string]bool) []string {
	var children []string

	children = append(children, detectNpmWorkspaces(repoDir, ignore)...)
	children = append(children, detectPnpmWorkspaces(repoDir, ignore)...)
	children = append(children, detectLernaPackages(repoDir, ignore)...)
	children = append(children, detectGoWork(repoDir)...)
	children = append(children, detectCargoWorkspace(repoDir)...)
	children = append(children, detectBazelProject(repoDir)...)
	children = append(children, detectGradleMultiProject(repoDir)...)

	deduped := dedupPaths(children)

	for _, c := range deduped {
		real, err := filepath.EvalSymlinks(c)
		if err == nil {
			seen[real] = true
		}
	}

	return deduped
}

func detectNpmWorkspaces(repoDir string, ignore []string) []string {
	data, err := os.ReadFile(filepath.Join(repoDir, "package.json"))
	if err != nil {
		return nil
	}

	var pkg struct {
		Workspaces interface{} `json:"workspaces"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return nil
	}

	patterns := extractWorkspacePatterns(pkg.Workspaces)
	return expandGlobs(repoDir, patterns, ignore)
}

func detectPnpmWorkspaces(repoDir string, ignore []string) []string {
	data, err := os.ReadFile(filepath.Join(repoDir, "pnpm-workspace.yaml"))
	if err != nil {
		return nil
	}

	var patterns []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "- ") {
			p := strings.TrimPrefix(line, "- ")
			p = strings.Trim(p, "'\"")
			patterns = append(patterns, p)
		}
	}

	return expandGlobs(repoDir, patterns, ignore)
}

func detectLernaPackages(repoDir string, ignore []string) []string {
	data, err := os.ReadFile(filepath.Join(repoDir, "lerna.json"))
	if err != nil {
		return nil
	}

	var lerna struct {
		Packages []string `json:"packages"`
	}
	if err := json.Unmarshal(data, &lerna); err != nil {
		return nil
	}

	return expandGlobs(repoDir, lerna.Packages, ignore)
}

func detectGoWork(repoDir string) []string {
	data, err := os.ReadFile(filepath.Join(repoDir, "go.work"))
	if err != nil {
		return nil
	}

	var children []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "//") || strings.HasPrefix(line, "go ") || line == "use (" || line == ")" {
			continue
		}
		if strings.HasPrefix(line, "use ") {
			line = strings.TrimPrefix(line, "use ")
		}
		line = strings.TrimSpace(line)
		if line == "" || line == "(" || line == ")" || line == "." {
			continue
		}
		abs := filepath.Join(repoDir, line)
		if info, err := os.Stat(abs); err == nil && info.IsDir() {
			children = append(children, abs)
		}
	}
	return children
}

func detectCargoWorkspace(repoDir string) []string {
	data, err := os.ReadFile(filepath.Join(repoDir, "Cargo.toml"))
	if err != nil {
		return nil
	}

	content := string(data)
	if !strings.Contains(content, "[workspace]") {
		return nil
	}

	var patterns []string
	inMembers := false
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "members") && strings.Contains(line, "=") {
			inMembers = true
			if strings.Contains(line, "[") {
				parts := strings.SplitN(line, "[", 2)
				if len(parts) == 2 {
					inner := strings.TrimSuffix(parts[1], "]")
					for _, p := range strings.Split(inner, ",") {
						p = strings.TrimSpace(p)
						p = strings.Trim(p, "\"'")
						if p != "" {
							patterns = append(patterns, p)
						}
					}
				}
			}
			continue
		}
		if inMembers {
			if line == "]" {
				inMembers = false
				continue
			}
			p := strings.Trim(line, "\"', ")
			if p != "" {
				patterns = append(patterns, p)
			}
		}
	}

	return expandGlobs(repoDir, patterns, nil)
}

func detectBazelProject(repoDir string) []string {
	for _, name := range []string{"WORKSPACE", "WORKSPACE.bazel", "MODULE.bazel"} {
		if _, err := os.Stat(filepath.Join(repoDir, name)); err == nil {
			return []string{}
		}
	}
	return nil
}

func detectGradleMultiProject(repoDir string) []string {
	data, err := os.ReadFile(filepath.Join(repoDir, "settings.gradle"))
	if err != nil {
		data, err = os.ReadFile(filepath.Join(repoDir, "settings.gradle.kts"))
		if err != nil {
			return nil
		}
	}

	var children []string
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if !strings.Contains(line, "include") {
			continue
		}
		for _, part := range strings.Split(line, ",") {
			part = strings.TrimSpace(part)
			for _, prefix := range []string{"include(", "include "} {
				part = strings.TrimPrefix(part, prefix)
			}
			part = strings.TrimSuffix(part, ")")
			part = strings.Trim(part, "'\"")
			if part == "" || strings.HasPrefix(part, "//") {
				continue
			}
			subdir := strings.ReplaceAll(part, ":", string(filepath.Separator))
			subdir = strings.TrimPrefix(subdir, string(filepath.Separator))
			abs := filepath.Join(repoDir, subdir)
			if info, err := os.Stat(abs); err == nil && info.IsDir() {
				children = append(children, abs)
			}
		}
	}
	return children
}

func extractWorkspacePatterns(v interface{}) []string {
	switch w := v.(type) {
	case []interface{}:
		var out []string
		for _, item := range w {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case map[string]interface{}:
		if pkgs, ok := w["packages"]; ok {
			return extractWorkspacePatterns(pkgs)
		}
	}
	return nil
}

func expandGlobs(base string, patterns []string, ignore []string) []string {
	var result []string
	for _, p := range patterns {
		abs := filepath.Join(base, p)
		matches, err := filepath.Glob(abs)
		if err != nil {
			continue
		}
		for _, m := range matches {
			if shouldIgnore(filepath.Base(m), ignore) {
				continue
			}
			info, err := os.Stat(m)
			if err != nil || !info.IsDir() {
				continue
			}
			result = append(result, m)
		}
	}
	return result
}

func dedupPaths(paths []string) []string {
	seen := make(map[string]bool)
	var out []string
	for _, p := range paths {
		real, err := filepath.EvalSymlinks(p)
		if err != nil {
			real = p
		}
		if seen[real] {
			continue
		}
		seen[real] = true
		out = append(out, p)
	}
	return out
}
