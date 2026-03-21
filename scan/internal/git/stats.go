package git

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Stats struct {
	Branch      string
	Branches    []string
	Uncommitted int
	Ahead       int
	Behind      int
	StashCount  int
	LastCommit  time.Time
	RemoteURL   *string
}

func GetStats(repoPath string) (*Stats, error) {
	s := &Stats{}

	out, err := RunGitCmd(repoPath,
		"-c", "gc.auto=0",
		"status", "--porcelain", "--branch")
	if err != nil {
		return nil, fmt.Errorf("get status: %w", err)
	}
	parseStatusBranch(out, s)

	s.Branches = listBranchesFromFS(repoPath)
	s.StashCount = countStashFromFS(repoPath)
	s.LastCommit = getLastCommitFromFS(repoPath)
	s.RemoteURL = getRemoteURLFromFS(repoPath)

	return s, nil
}

func parseStatusBranch(out string, s *Stats) {
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if len(lines) == 0 {
		return
	}

	header := lines[0]
	if strings.HasPrefix(header, "## ") {
		header = header[3:]
		if idx := strings.Index(header, "..."); idx >= 0 {
			s.Branch = header[:idx]
			rest := header[idx+3:]
			if ab := strings.Index(rest, " ["); ab >= 0 {
				info := rest[ab+2 : len(rest)-1]
				for _, part := range strings.Split(info, ", ") {
					part = strings.TrimSpace(part)
					if strings.HasPrefix(part, "ahead ") {
						fmt.Sscanf(part, "ahead %d", &s.Ahead)
					}
					if strings.HasPrefix(part, "behind ") {
						fmt.Sscanf(part, "behind %d", &s.Behind)
					}
				}
			}
		} else {
			s.Branch = strings.TrimSpace(header)
		}
	}

	uncommitted := 0
	for _, line := range lines[1:] {
		if line != "" {
			uncommitted++
		}
	}
	s.Uncommitted = uncommitted
}

func countStashFromFS(repoPath string) int {
	data, err := os.ReadFile(filepath.Join(repoPath, ".git", "logs", "refs", "stash"))
	if err != nil {
		return 0
	}
	content := strings.TrimSpace(string(data))
	if content == "" {
		return 0
	}
	return len(strings.Split(content, "\n"))
}

func getLastCommitFromFS(repoPath string) time.Time {
	data, err := os.ReadFile(filepath.Join(repoPath, ".git", "logs", "HEAD"))
	if err != nil {
		return time.Time{}
	}

	content := strings.TrimSpace(string(data))
	if content == "" {
		return time.Time{}
	}

	lastNewline := strings.LastIndex(content, "\n")
	var lastLine string
	if lastNewline >= 0 {
		lastLine = content[lastNewline+1:]
	} else {
		lastLine = content
	}

	// reflog line format: <old-sha> <new-sha> <name> <email> <unix-ts> <tz-offset>\t<message>
	tab := strings.IndexByte(lastLine, '\t')
	if tab < 0 {
		return time.Time{}
	}
	meta := lastLine[:tab]

	// find the timestamp: look for "> " which ends the email, then parse unix timestamp
	emailEnd := strings.LastIndex(meta, "> ")
	if emailEnd < 0 {
		return time.Time{}
	}
	tsStr := strings.TrimSpace(meta[emailEnd+2:])
	parts := strings.Fields(tsStr)
	if len(parts) < 1 {
		return time.Time{}
	}

	var unix int64
	fmt.Sscanf(parts[0], "%d", &unix)
	if unix == 0 {
		return time.Time{}
	}
	return time.Unix(unix, 0).UTC()
}

func getRemoteURLFromFS(repoPath string) *string {
	data, err := os.ReadFile(filepath.Join(repoPath, ".git", "config"))
	if err != nil {
		return nil
	}

	inOrigin := false
	for _, line := range strings.Split(string(data), "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == `[remote "origin"]` {
			inOrigin = true
			continue
		}
		if strings.HasPrefix(trimmed, "[") {
			inOrigin = false
			continue
		}
		if inOrigin && strings.HasPrefix(trimmed, "url = ") {
			url := strings.TrimPrefix(trimmed, "url = ")
			url = strings.TrimSpace(url)
			if url != "" {
				return &url
			}
		}
	}
	return nil
}

func RunGitCmd(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", repoPath}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func RunGitCmdContext(ctx context.Context, repoPath string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", append([]string{"-C", repoPath}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}

func listBranchesFromFS(repoPath string) []string {
	refsDir := filepath.Join(repoPath, ".git", "refs", "heads")
	var branches []string

	filepath.Walk(refsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		rel, err := filepath.Rel(refsDir, path)
		if err != nil {
			return nil
		}
		branches = append(branches, rel)
		return nil
	})

	if len(branches) == 0 {
		data, err := os.ReadFile(filepath.Join(repoPath, ".git", "packed-refs"))
		if err != nil {
			return []string{}
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, "^") {
				continue
			}
			parts := strings.Fields(line)
			if len(parts) >= 2 {
				ref := parts[1]
				if strings.HasPrefix(ref, "refs/heads/") {
					branches = append(branches, strings.TrimPrefix(ref, "refs/heads/"))
				}
			}
		}
	}

	if len(branches) == 0 {
		return []string{}
	}
	return branches
}
