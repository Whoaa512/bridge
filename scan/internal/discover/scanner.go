package discover

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/cjwinslow/bridge/scan/internal/config"
	"github.com/cjwinslow/bridge/scan/internal/git"
	"github.com/cjwinslow/bridge/scan/internal/spec"
)

type projectWork struct {
	index int
	dp    Project
}

type projectResult struct {
	parent      spec.Project
	children    []spec.Project
}

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

	if len(result.Projects) == 0 {
		return s
	}

	workers := runtime.NumCPU()
	if workers > 8 {
		workers = 8
	}

	work := make(chan projectWork)
	results := make([]projectResult, len(result.Projects))

	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for w := range work {
				results[w.index] = processProject(w.dp, cfg)
			}
		}()
	}

	for i, dp := range result.Projects {
		work <- projectWork{index: i, dp: dp}
	}
	close(work)
	wg.Wait()

	for _, r := range results {
		s.Projects = append(s.Projects, r.parent)
		s.Projects = append(s.Projects, r.children...)
	}

	return s
}

func processProject(dp Project, cfg *config.Config) (r projectResult) {
	defer func() {
		if rec := recover(); rec != nil {
			id := makeProjectID(dp.Path, cfg.ScanRoots)
			cl := Classify(nil, dp.HasInfra, cfg.Classifications[id])
			r.parent = spec.Project{
				ID:                   id,
				Path:                 dp.Path,
				Name:                 dp.Name,
				Kind:                 dp.Kind,
				Classification:       cl.Class,
				ClassificationSource: cl.Source,
				Languages:            []string{},
				PRs:                  []spec.PR{},
				Tasks:                []spec.Task{},
				Subprojects:          []string{},
				Flags:                []string{},
				Errors: []spec.ScanErr{{
					Source:  "scanner",
					Message: fmt.Sprintf("panic: %v", rec),
					At:      time.Now().UTC(),
				}},
			}
			r.children = nil
		}
	}()

	sp := buildProject(dp, cfg)

	var parentRemoteURL *string
	if sp.Git != nil {
		parentRemoteURL = sp.Git.RemoteURL
	}

	var children []spec.Project
	for _, childPath := range dp.MonorepoChildren {
		child := buildMonorepoChild(dp, parentRemoteURL, childPath, cfg)
		children = append(children, child)
		sp.Subprojects = append(sp.Subprojects, child.ID)
	}

	r.parent = sp
	r.children = children
	return r
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
				Branches:    stats.Branches,
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

	p.Size = CollectSize(dp.Path, cfg.Ignore)

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

func buildMonorepoChild(parent Project, parentRemoteURL *string, childPath string, cfg *config.Config) spec.Project {
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

	cl := Classify(parentRemoteURL, parent.HasInfra, cfg.Classifications[id])
	p.Classification = cl.Class
	p.ClassificationSource = cl.Source

	p.Size = CollectSize(childPath, cfg.Ignore)

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
