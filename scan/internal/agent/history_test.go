package agent

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPathToSessionDir(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"/Users/cj/code/bridge", "--Users-cj-code-bridge--"},
		{"/Users/cj_winslow/code/bridge", "--Users-cj_winslow-code-bridge--"},
		{"/tmp/test", "--tmp-test--"},
	}
	for _, tt := range tests {
		got := pathToSessionDir(tt.input)
		if got != tt.want {
			t.Errorf("pathToSessionDir(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func writeJSONL(t *testing.T, path string, lines ...string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		t.Fatal(err)
	}
	content := strings.Join(lines, "\n") + "\n"
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatal(err)
	}
}

func TestReadSessionHistoryBasicParse(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--Users-cj-code-bridge--")

	writeJSONL(t,
		filepath.Join(dir, "2026-03-19T00-03-49-756Z_abc123.jsonl"),
		`{"type":"session","id":"abc-123","timestamp":"2026-03-19T00:03:49.756Z","cwd":"/Users/cj/code/bridge"}`,
		`{"type":"model_change","modelId":"global.anthropic.claude-opus-4-6-v1"}`,
		`{"type":"message","message":{"role":"user","content":[{"type":"text","text":"Hello world, this is a test session"}]}}`,
	)

	sessions, err := ReadSessionHistoryFromBase(base, "/Users/cj/code/bridge")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}

	s := sessions[0]
	if s.ID != "abc-123" {
		t.Errorf("id = %q, want %q", s.ID, "abc-123")
	}
	if s.CWD != "/Users/cj/code/bridge" {
		t.Errorf("cwd = %q, want %q", s.CWD, "/Users/cj/code/bridge")
	}
	if s.Model != "global.anthropic.claude-opus-4-6-v1" {
		t.Errorf("model = %q, want %q", s.Model, "global.anthropic.claude-opus-4-6-v1")
	}
	if s.Topic != "Hello world, this is a test session" {
		t.Errorf("topic = %q, want %q", s.Topic, "Hello world, this is a test session")
	}
}

func TestReadSessionHistoryMissingDir(t *testing.T) {
	base := t.TempDir()
	sessions, err := ReadSessionHistoryFromBase(base, "/nonexistent/project")
	if err != nil {
		t.Fatal(err)
	}
	if sessions != nil {
		t.Errorf("expected nil, got %v", sessions)
	}
}

func TestReadSessionHistoryTopicTruncation(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--tmp-test--")

	longText := strings.Repeat("abcde", 30) // 150 chars
	writeJSONL(t,
		filepath.Join(dir, "2026-03-20T00-00-00-000Z_def456.jsonl"),
		`{"type":"session","id":"def-456","timestamp":"2026-03-20T00:00:00.000Z","cwd":"/tmp/test"}`,
		`{"type":"model_change","modelId":"some-model"}`,
		`{"type":"message","message":{"role":"user","content":[{"type":"text","text":"`+longText+`"}]}}`,
	)

	sessions, err := ReadSessionHistoryFromBase(base, "/tmp/test")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}

	if len([]rune(sessions[0].Topic)) != 100 {
		t.Errorf("topic length = %d, want 100", len([]rune(sessions[0].Topic)))
	}
}

func TestReadSessionHistorySortedNewestFirst(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--tmp-sort--")

	writeJSONL(t,
		filepath.Join(dir, "2026-03-18T00-00-00-000Z_aaa.jsonl"),
		`{"type":"session","id":"older","timestamp":"2026-03-18T00:00:00.000Z","cwd":"/tmp/sort"}`,
	)
	writeJSONL(t,
		filepath.Join(dir, "2026-03-20T00-00-00-000Z_bbb.jsonl"),
		`{"type":"session","id":"newer","timestamp":"2026-03-20T00:00:00.000Z","cwd":"/tmp/sort"}`,
	)

	sessions, err := ReadSessionHistoryFromBase(base, "/tmp/sort")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}
	if sessions[0].ID != "newer" {
		t.Errorf("first session should be newer, got %q", sessions[0].ID)
	}
	if sessions[1].ID != "older" {
		t.Errorf("second session should be older, got %q", sessions[1].ID)
	}
}

func TestReadSessionHistorySkipsNonUserMessages(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--tmp-roles--")

	writeJSONL(t,
		filepath.Join(dir, "2026-03-20T00-00-00-000Z_ccc.jsonl"),
		`{"type":"session","id":"ccc","timestamp":"2026-03-20T00:00:00.000Z","cwd":"/tmp/roles"}`,
		`{"type":"message","message":{"role":"assistant","content":[{"type":"text","text":"I am assistant"}]}}`,
		`{"type":"message","message":{"role":"user","content":[{"type":"text","text":"User prompt here"}]}}`,
	)

	sessions, err := ReadSessionHistoryFromBase(base, "/tmp/roles")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Topic != "User prompt here" {
		t.Errorf("topic = %q, want %q", sessions[0].Topic, "User prompt here")
	}
}

func TestReadSessionHistoryPlainStringContent(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--tmp-plain--")

	writeJSONL(t,
		filepath.Join(dir, "2026-03-20T00-00-00-000Z_ddd.jsonl"),
		`{"type":"session","id":"ddd","timestamp":"2026-03-20T00:00:00.000Z","cwd":"/tmp/plain"}`,
		`{"type":"message","message":{"role":"user","content":"Simple string content"}}`,
	)

	sessions, err := ReadSessionHistoryFromBase(base, "/tmp/plain")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Topic != "Simple string content" {
		t.Errorf("topic = %q, want %q", sessions[0].Topic, "Simple string content")
	}
}

func TestReadSessionHistoryLimit50(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--tmp-limit--")

	for i := 0; i < 60; i++ {
		ts := strings.Replace(
			strings.Replace(
				"2026-03-20T00-00-00-000Z",
				"00-00-00",
				strings.Replace(
					padInt(i/3600)+"-"+padInt((i%3600)/60)+"-"+padInt(i%60),
					"", "", 0,
				),
				1,
			),
			"", "", 0,
		)
		fname := ts + "_" + padInt(i) + ".jsonl"
		writeJSONL(t,
			filepath.Join(dir, fname),
			`{"type":"session","id":"s-`+padInt(i)+`","timestamp":"2026-03-20T`+padInt(i/3600)+`:`+padInt((i%3600)/60)+`:`+padInt(i%60)+`.000Z","cwd":"/tmp/limit"}`,
		)
	}

	sessions, err := ReadSessionHistoryFromBase(base, "/tmp/limit")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 50 {
		t.Errorf("expected 50 sessions, got %d", len(sessions))
	}
}

func padInt(n int) string {
	if n < 10 {
		return "0" + strings.TrimLeft(strings.Replace(string(rune('0'+n)), "", "", 0), "")
	}
	return strings.Replace(string([]rune{rune('0' + n/10), rune('0' + n%10)}), "", "", 0)
}

func TestReadSessionHistoryNoModelOrTopic(t *testing.T) {
	base := t.TempDir()
	dir := filepath.Join(base, "--tmp-minimal--")

	writeJSONL(t,
		filepath.Join(dir, "2026-03-20T00-00-00-000Z_eee.jsonl"),
		`{"type":"session","id":"eee","timestamp":"2026-03-20T00:00:00.000Z","cwd":"/tmp/minimal"}`,
	)

	sessions, err := ReadSessionHistoryFromBase(base, "/tmp/minimal")
	if err != nil {
		t.Fatal(err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session, got %d", len(sessions))
	}
	if sessions[0].Model != "" {
		t.Errorf("model = %q, want empty", sessions[0].Model)
	}
	if sessions[0].Topic != "" {
		t.Errorf("topic = %q, want empty", sessions[0].Topic)
	}
}
