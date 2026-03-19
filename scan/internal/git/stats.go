package git

import (
	"fmt"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

type Stats struct {
	Branch      string
	Uncommitted int
	Ahead       int
	Behind      int
	StashCount  int
	LastCommit  time.Time
	RemoteURL   *string
}

func GetStats(repoPath string) (*Stats, error) {
	s := &Stats{}

	branch, err := runGit(repoPath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("get branch: %w", err)
	}
	s.Branch = strings.TrimSpace(branch)

	s.Uncommitted = countUncommitted(repoPath)
	s.Ahead, s.Behind = getAheadBehind(repoPath)
	s.StashCount = countStash(repoPath)
	s.LastCommit = getLastCommit(repoPath)
	s.RemoteURL = getRemoteURL(repoPath)

	return s, nil
}

func countUncommitted(repoPath string) int {
	out, err := runGit(repoPath, "status", "--porcelain")
	if err != nil {
		return 0
	}
	out = strings.TrimSpace(out)
	if out == "" {
		return 0
	}
	return len(strings.Split(out, "\n"))
}

func getAheadBehind(repoPath string) (int, int) {
	out, err := runGit(repoPath, "rev-list", "--left-right", "--count", "HEAD...@{upstream}")
	if err != nil {
		return 0, 0
	}

	parts := strings.Fields(strings.TrimSpace(out))
	if len(parts) != 2 {
		return 0, 0
	}

	ahead, _ := strconv.Atoi(parts[0])
	behind, _ := strconv.Atoi(parts[1])
	return ahead, behind
}

func countStash(repoPath string) int {
	out, err := runGit(repoPath, "stash", "list")
	if err != nil {
		return 0
	}
	out = strings.TrimSpace(out)
	if out == "" {
		return 0
	}
	return len(strings.Split(out, "\n"))
}

func getLastCommit(repoPath string) time.Time {
	out, err := runGit(repoPath, "log", "-1", "--format=%aI")
	if err != nil {
		return time.Time{}
	}
	t, err := time.Parse(time.RFC3339, strings.TrimSpace(out))
	if err != nil {
		return time.Time{}
	}
	return t
}

func getRemoteURL(repoPath string) *string {
	out, err := runGit(repoPath, "remote", "get-url", "origin")
	if err != nil {
		return nil
	}
	url := strings.TrimSpace(out)
	if url == "" {
		return nil
	}
	return &url
}

func runGit(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", repoPath}, args...)...)
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	return string(out), nil
}
