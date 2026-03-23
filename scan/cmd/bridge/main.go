package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"syscall"

	"github.com/cjwinslow/bridge/scan/internal/agent"
	"github.com/cjwinslow/bridge/scan/internal/config"
	"github.com/cjwinslow/bridge/scan/internal/discover"
	"github.com/cjwinslow/bridge/scan/internal/server"
	"github.com/cjwinslow/bridge/scan/internal/spec"
	"github.com/cjwinslow/bridge/scan/internal/watch"
)

func main() {
	if len(os.Args) < 2 {
		printHelp()
		os.Exit(0)
	}

	cmd := os.Args[1]
	switch cmd {
	case "scan":
		runScan()
	case "serve":
		runServe()
	case "rpc":
		runRPC()
	case "help", "--help", "-h":
		printHelp()
	default:
		fmt.Fprintf(os.Stderr, "unknown command: %s\n\n", cmd)
		printHelp()
		os.Exit(1)
	}
}

func printHelp() {
	fmt.Print(`Bridge — dev environment command center

Usage:
  bridge              Show this help
  bridge scan         Run one-shot scan, emit spec.json
  bridge scan --json  Run scan, print spec to stdout
  bridge serve        Start daemon (scanner + HTTP on :7400)
  bridge serve --port 8080  Custom port
  bridge serve --web-dir ./web/dist  Serve web UI from directory
  bridge rpc scan     Trigger scan, return spec as JSON
  bridge rpc projects List all projects as JSON

Options:
  --help, -h          Show this help
`)
}

func loadOrOnboard() *config.Config {
	if config.Exists() {
		cfg, err := config.Load()
		if err != nil {
			fmt.Fprintf(os.Stderr, "error loading config: %v\n", err)
			os.Exit(1)
		}
		return cfg
	}

	cfg, err := config.RunOnboarding(os.Stdin, os.Stderr)
	if err != nil {
		fmt.Fprintf(os.Stderr, "onboarding failed: %v\n", err)
		os.Exit(1)
	}
	return cfg
}

func doScan(cfg *config.Config) *spec.BridgeSpec {
	lock, err := spec.AcquireLock()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
	defer lock.Release()

	return scanWithConfig(cfg, nil)
}

func scanWithConfig(cfg *config.Config, cache *watch.Cache) *spec.BridgeSpec {
	return discover.BuildSpecForPaths(cfg.FocusedProjects, cfg, cache)
}

func runScan() {
	cfg := loadOrOnboard()
	s := doScan(cfg)

	jsonFlag := slices.Contains(os.Args[2:], "--json")

	if jsonFlag {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		enc.Encode(s)
		return
	}

	if err := spec.Emit(s); err != nil {
		fmt.Fprintf(os.Stderr, "error writing spec: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Scanned %d projects → %s\n", len(s.Projects), spec.SpecPath())
}

func parsePort() int {
	for i, arg := range os.Args {
		if arg == "--port" && i+1 < len(os.Args) {
			p, err := strconv.Atoi(os.Args[i+1])
			if err != nil {
				fmt.Fprintf(os.Stderr, "invalid port: %s\n", os.Args[i+1])
				os.Exit(1)
			}
			return p
		}
		if strings.HasPrefix(arg, "--port=") {
			p, err := strconv.Atoi(strings.TrimPrefix(arg, "--port="))
			if err != nil {
				fmt.Fprintf(os.Stderr, "invalid port: %s\n", arg)
				os.Exit(1)
			}
			return p
		}
	}
	return 7400
}

func parseWebDir() string {
	for i, arg := range os.Args {
		if arg == "--web-dir" && i+1 < len(os.Args) {
			return os.Args[i+1]
		}
		if strings.HasPrefix(arg, "--web-dir=") {
			return strings.TrimPrefix(arg, "--web-dir=")
		}
	}

	candidates := []string{"web/dist"}
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates, filepath.Join(filepath.Dir(exe), "web", "dist"))
	}

	for _, c := range candidates {
		if info, err := os.Stat(c); err == nil && info.IsDir() {
			return c
		}
	}
	return ""
}

func runServe() {
	cfg := loadOrOnboard()
	port := parsePort()
	webDir := parseWebDir()

	lock, err := spec.AcquireLock()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	cache := watch.NewCache()

	fmt.Fprintf(os.Stderr, "Scanning...\n")
	s := scanWithConfig(cfg, cache)
	fmt.Fprintf(os.Stderr, "Found %d projects\n", len(s.Projects))

	if err := spec.Emit(s); err != nil {
		fmt.Fprintf(os.Stderr, "error writing spec: %v\n", err)
		lock.Release()
		os.Exit(1)
	}

	var opts []server.Option
	opts = append(opts, server.WithConfig(cfg))

	if webDir != "" {
		fmt.Fprintf(os.Stderr, "Serving web UI from %s\n", webDir)
		opts = append(opts, server.WithWebDir(webDir))
	} else {
		fmt.Fprintf(os.Stderr, "No web/dist found, serving API only\n")
	}

	srv := server.New(port, opts...)
	srv.SetSpec(s)

	go func() {
		walkResult := discover.Walk(cfg.ScanRoots, cfg.Ignore)
		repoIndex := make([]server.RepoEntry, 0, len(walkResult.Projects))
		for _, p := range walkResult.Projects {
			repoIndex = append(repoIndex, server.RepoEntry{Name: p.Name, Path: p.Path})
		}
		srv.SetRepoIndex(repoIndex)
		fmt.Fprintf(os.Stderr, "Indexed %d repos for ⌘K search\n", len(repoIndex))
	}()

	home, _ := os.UserHomeDir()
	manifestPath := filepath.Join(home, ".bridge", "sessions", "active.json")

	sm := agent.NewSessionManager(func(sessionID string, data json.RawMessage) {
		var env struct{ Type string `json:"type"` }
		json.Unmarshal(data, &env)

		if env.Type == "session_exit" || env.Type == "session_error" {
			srv.Broadcast(data)
			return
		}

		kind := agent.ClassifyOutput(data)
		var wrapped []byte
		var merr error

		switch kind {
		case "response":
			wrapped, merr = json.Marshal(map[string]interface{}{
				"type":      "pi_response",
				"sessionId": sessionID,
				"response":  json.RawMessage(data),
			})
		case "extension_ui_request":
			if !agent.IsInteractiveUIRequest(data) {
				return
			}
			wrapped, merr = json.Marshal(map[string]interface{}{
				"type":      "extension_ui_request",
				"sessionId": sessionID,
				"request":   json.RawMessage(data),
			})
		default:
			wrapped, merr = json.Marshal(map[string]interface{}{
				"type":      "pi_event",
				"sessionId": sessionID,
				"event":     json.RawMessage(data),
			})
		}
		if merr != nil {
			return
		}
		srv.Broadcast(wrapped)
	}, manifestPath)
	srv.SetSessionManager(sm)

	if results := sm.RecoverSessions(); len(results) > 0 {
		for _, r := range results {
			if r.Recovered {
				fmt.Fprintf(os.Stderr, "Recovered session %s\n", r.ID)
			} else {
				fmt.Fprintf(os.Stderr, "Failed to recover session %s: %s\n", r.ID, r.Error)
			}
		}
	}
	var w *watch.Watcher
	w, err = watch.NewWatcher(cache, func(projectPath string) {
		fmt.Fprintf(os.Stderr, "Rescan triggered by %s\n", projectPath)
		updated := scanWithConfig(cfg, cache)
		if err := spec.Emit(updated); err != nil {
			fmt.Fprintf(os.Stderr, "error writing spec: %v\n", err)
			w.SetScanning(false)
			return
		}
		srv.SetSpec(updated)
		fmt.Fprintf(os.Stderr, "Rescanned %d projects\n", len(updated.Projects))
		w.SetScanning(false)
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "error starting watcher: %v\n", err)
		lock.Release()
		os.Exit(1)
	}

	w.SetScanning(true)
	for _, p := range s.Projects {
		if p.Git != nil {
			if err := w.WatchProject(p.Path); err != nil {
				fmt.Fprintf(os.Stderr, "warning: cannot watch %s: %v\n", p.Path, err)
			}
		}
	}
	w.SetScanning(false)

	srv.SetOnConfigChange(func(focusedPaths []string) {
		var updated *spec.BridgeSpec
		if len(focusedPaths) > 0 {
			updated = discover.BuildSpecForPaths(focusedPaths, cfg, cache)
		} else {
			updated = discover.BuildSpec(cfg, cache)
		}
		if err := spec.Emit(updated); err != nil {
			fmt.Fprintf(os.Stderr, "error writing spec on config change: %v\n", err)
			return
		}
		srv.SetSpec(updated)
		for _, p := range updated.Projects {
			if p.Git != nil {
				w.WatchProject(p.Path)
			}
		}
		fmt.Fprintf(os.Stderr, "Config change rescan: %d projects\n", len(updated.Projects))
	})

	go func() {
		fmt.Fprintf(os.Stderr, "Serving on :%d\n", port)
		if err := srv.Start(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "server error: %v\n", err)
			os.Exit(1)
		}
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	fmt.Fprintf(os.Stderr, "\nShutting down...\n")
	sm.Shutdown()
	w.Close()
	srv.Close()
	lock.Release()
}

func runRPC() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "Usage: bridge rpc <command>")
		fmt.Fprintln(os.Stderr, "Commands: scan, projects")
		os.Exit(1)
	}

	sub := os.Args[2]
	switch sub {
	case "scan":
		rpcScan()
	case "projects":
		rpcProjects()
	default:
		fmt.Fprintf(os.Stderr, "unknown rpc command: %s\n", sub)
		os.Exit(1)
	}
}

func rpcScan() {
	cfg := loadOrOnboard()
	s := doScan(cfg)

	if err := spec.Emit(s); err != nil {
		fmt.Fprintf(os.Stderr, "error writing spec: %v\n", err)
		os.Exit(1)
	}

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(s)
}

func rpcProjects() {
	cfg := loadOrOnboard()
	s := doScan(cfg)

	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	enc.Encode(s.Projects)
}
