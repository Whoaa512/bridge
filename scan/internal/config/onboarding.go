package config

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strings"
)

func RunOnboarding(in io.Reader, out io.Writer) (*Config, error) {
	reader := bufio.NewReader(in)

	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "🌉 Welcome to Bridge!")
	fmt.Fprintln(out, "Let's configure your dev environment scanner.")
	fmt.Fprintln(out, "")

	roots, err := askScanRoots(reader, out)
	if err != nil {
		return nil, err
	}

	ignore, err := askIgnoreList(reader, out)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		SpecVersion:     "0.1.0",
		ScanRoots:       roots,
		Ignore:          ignore,
		Classifications: map[string]string{},
		Priorities:      map[string]int{},
		Groups:          map[string][]string{},
		Services:        Services{KnownPorts: map[string]string{}},
	}

	if err := cfg.Save(); err != nil {
		return nil, fmt.Errorf("save config: %w", err)
	}

	fmt.Fprintln(out, "")
	fmt.Fprintf(out, "✅ Config saved to %s\n", ConfigPath())
	fmt.Fprintln(out, "Run `bridge scan` to start scanning.")
	return cfg, nil
}

func askScanRoots(reader *bufio.Reader, out io.Writer) ([]string, error) {
	fmt.Fprintln(out, "Which directories should Bridge scan for projects?")
	fmt.Fprintln(out, "Enter paths separated by commas (e.g. ~/code, ~/work):")
	fmt.Fprint(out, "> ")

	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, fmt.Errorf("read scan roots: %w", err)
	}

	var roots []string
	for _, r := range strings.Split(line, ",") {
		r = strings.TrimSpace(r)
		if r == "" {
			continue
		}
		r = expandHome(r)
		roots = append(roots, r)
	}

	if len(roots) == 0 {
		return nil, fmt.Errorf("at least one scan root is required")
	}

	return roots, nil
}

func askIgnoreList(reader *bufio.Reader, out io.Writer) ([]string, error) {
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "Default ignore list:")
	for _, d := range DefaultIgnore {
		fmt.Fprintf(out, "  - %s\n", d)
	}
	fmt.Fprintln(out, "")
	fmt.Fprintln(out, "Add extra patterns (comma-separated), or press Enter to keep defaults:")
	fmt.Fprint(out, "> ")

	line, err := reader.ReadString('\n')
	if err != nil {
		return nil, fmt.Errorf("read ignore list: %w", err)
	}

	ignore := make([]string, len(DefaultIgnore))
	copy(ignore, DefaultIgnore)

	for _, p := range strings.Split(line, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			ignore = append(ignore, p)
		}
	}

	return ignore, nil
}

func expandHome(path string) string {
	if !strings.HasPrefix(path, "~/") {
		return path
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return path
	}
	return home + path[1:]
}
