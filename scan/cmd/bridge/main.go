package main

import (
	"fmt"
	"os"
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
  bridge rpc scan     Trigger scan, return spec as JSON
  bridge rpc projects List all projects as JSON

Options:
  --help, -h          Show this help
`)
}

func runScan() {
	fmt.Fprintln(os.Stderr, "bridge scan: not yet implemented")
	os.Exit(1)
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
		fmt.Fprintln(os.Stderr, "bridge rpc scan: not yet implemented")
		os.Exit(1)
	case "projects":
		fmt.Fprintln(os.Stderr, "bridge rpc projects: not yet implemented")
		os.Exit(1)
	default:
		fmt.Fprintf(os.Stderr, "unknown rpc command: %s\n", sub)
		os.Exit(1)
	}
}
