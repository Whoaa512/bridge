package discover

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/config"
	"github.com/cjwinslow/bridge/scan/internal/git"
	"github.com/cjwinslow/bridge/scan/internal/spec"
)

func BuildSpec(cfg *config.Config) *spec.BridgeSpec {
	result := Walk(cfg.ScanRoots, cfg.Ignore)

	hostname, _ := os.Hostname()
	uptime := getUptime()

	now := time.Now().UTC()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	s := &spec.BridgeSpec{
		Version:   spec.Version,
		ScannedAt: now,
		Machine: spec.Machine{
			Hostname: hostname,
			OS:       goos(),
			Uptime:   uptime,
		},
		Projects: []spec.Project{},
		Infrastructure: spec.Infrastructure{
			Ports:  []spec.Port{},
			Docker: []spec.DockerContainer{},
			Resources: spec.Resources{
				CPUByProject: map[string]float64{},
				MemByProject: map[string]int64{},
			},
		},
		Alerts: []spec.Alert{},
		Cycle: spec.Cycle{
			Period:  "daily",
			Start:   dayStart,
			End:     now,
			Summary: spec.CycleSummary{},
		},
	}

	for _, dp := range result.Projects {
		sp := buildProject(dp, cfg)
		s.Projects = append(s.Projects, sp)

		for _, childPath := range dp.MonorepoChildren {
			child := buildMonorepoChild(dp, childPath, cfg)
			s.Projects = append(s.Projects, child)
			sp.Subprojects = append(sp.Subprojects, child.ID)
		}

		for i, p := range s.Projects {
			if p.ID == sp.ID {
				s.Projects[i] = sp
				break
			}
		}
	}

	return s
}

func buildProject(dp Project, cfg *config.Config) spec.Project {
	id := makeProjectID(dp.Path, cfg.ScanRoots)
	now := time.Now().UTC()

	p := spec.Project{
		ID:          id,
		Path:        dp.Path,
		Name:        dp.Name,
		Kind:        dp.Kind,
		Languages:   []string{},
		Git:         nil,
		CI:          nil,
		PRs:         []spec.PR{},
		Tasks:       []spec.Task{},
		Subprojects: []string{},
		Flags:       []string{},
		Errors:      []spec.ScanErr{},
	}

	if dp.IsGit {
		stats, err := git.GetStats(dp.Path)
		if err != nil {
			p.Errors = append(p.Errors, spec.ScanErr{
				Source:  "git",
				Message: err.Error(),
				At:      now,
			})
		} else {
			p.Git = &spec.GitStatus{
				Branch:      stats.Branch,
				Uncommitted: stats.Uncommitted,
				Ahead:       stats.Ahead,
				Behind:      stats.Behind,
				StashCount:  stats.StashCount,
				LastCommit:  stats.LastCommit,
				RemoteURL:   stats.RemoteURL,
			}

			cl := Classify(stats.RemoteURL, dp.HasInfra, cfg.Classifications[id])
			p.Classification = cl.Class
			p.ClassificationSource = cl.Source

			if !stats.LastCommit.IsZero() {
				staleDays := int(now.Sub(stats.LastCommit).Hours() / 24)
				p.Activity = &spec.Activity{
					LastTouch:       stats.LastCommit,
					CommitsThisWeek: countCommitsThisWeek(dp.Path),
					StaleDays:       staleDays,
				}
			}
		}
	}

	if p.Classification == "" {
		cl := Classify(nil, dp.HasInfra, cfg.Classifications[id])
		p.Classification = cl.Class
		p.ClassificationSource = cl.Source
	}

	if dp.HasInfra {
		p.Flags = append(p.Flags, "has_infra")
	}
	if len(dp.MonorepoChildren) > 0 {
		p.Flags = append(p.Flags, "monorepo")
	}

	if priority, ok := cfg.Priorities[id]; ok {
		p.Priority = &priority
	}

	return p
}

func buildMonorepoChild(parent Project, childPath string, cfg *config.Config) spec.Project {
	id := makeProjectID(childPath, cfg.ScanRoots)
	name := filepath.Base(childPath)

	p := spec.Project{
		ID:                   id,
		Path:                 childPath,
		Name:                 name,
		Kind:                 "monorepo_child",
		Classification:       "",
		ClassificationSource: "",
		Languages:            []string{},
		PRs:                  []spec.PR{},
		Tasks:                []spec.Task{},
		Subprojects:          []string{},
		Flags:                []string{},
		Errors:               []spec.ScanErr{},
	}

	cl := Classify(nil, false, cfg.Classifications[id])
	if parent.IsGit {
		if stats, err := git.GetStats(parent.Path); err == nil && stats.RemoteURL != nil {
			cl = Classify(stats.RemoteURL, parent.HasInfra, cfg.Classifications[id])
		}
	}
	p.Classification = cl.Class
	p.ClassificationSource = cl.Source

	if priority, ok := cfg.Priorities[id]; ok {
		p.Priority = &priority
	}

	return p
}

func makeProjectID(projectPath string, scanRoots []string) string {
	for _, root := range scanRoots {
		root = expandHome(root)
		resolved, err := filepath.EvalSymlinks(root)
		if err != nil {
			resolved = root
		}

		parentOfRoot := filepath.Dir(resolved)
		rel, err := filepath.Rel(parentOfRoot, projectPath)
		if err != nil {
			continue
		}
		if strings.HasPrefix(rel, "..") {
			continue
		}
		return "project:" + rel
	}
	return "project:" + filepath.Base(projectPath)
}

func countCommitsThisWeek(repoPath string) int {
	out, err := git.RunGitCmd(repoPath, "rev-list", "--count", "--since=1 week ago", "HEAD")
	if err != nil {
		return 0
	}
	count := 0
	fmt.Sscanf(strings.TrimSpace(out), "%d", &count)
	return count
}
