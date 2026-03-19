package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"strconv"
	"strings"
	"syscall"

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

	return discover.BuildSpec(cfg)
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

func runServe() {
	cfg := loadOrOnboard()
	port := parsePort()

	lock, err := spec.AcquireLock()
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	fmt.Fprintf(os.Stderr, "Scanning...\n")
	s := discover.BuildSpec(cfg)
	fmt.Fprintf(os.Stderr, "Found %d projects\n", len(s.Projects))

	if err := spec.Emit(s); err != nil {
		fmt.Fprintf(os.Stderr, "error writing spec: %v\n", err)
		lock.Release()
		os.Exit(1)
	}

	srv := server.New(port)
	srv.SetSpec(s)

	cache := watch.NewCache()
	w, err := watch.NewWatcher(cache, func(projectPath string) {
		fmt.Fprintf(os.Stderr, "Rescan triggered by %s\n", projectPath)
		updated := discover.BuildSpec(cfg)
		if err := spec.Emit(updated); err != nil {
			fmt.Fprintf(os.Stderr, "error writing spec: %v\n", err)
			return
		}
		srv.SetSpec(updated)
		fmt.Fprintf(os.Stderr, "Rescanned %d projects\n", len(updated.Projects))
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "error starting watcher: %v\n", err)
		lock.Release()
		os.Exit(1)
	}

	for _, p := range s.Projects {
		if p.Git != nil {
			if err := w.WatchProject(p.Path); err != nil {
				fmt.Fprintf(os.Stderr, "warning: cannot watch %s: %v\n", p.Path, err)
			}
		}
	}

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
