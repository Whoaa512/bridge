package agent

import (
	"bufio"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type HistoricalSession struct {
	ID        string    `json:"id"`
	CWD       string    `json:"cwd"`
	Timestamp time.Time `json:"timestamp"`
	Model     string    `json:"model"`
	Topic     string    `json:"topic"`
	FilePath  string    `json:"filePath"`
}

func pathToSessionDir(projectPath string) string {
	cleaned := strings.TrimPrefix(projectPath, "/")
	encoded := strings.ReplaceAll(cleaned, "/", "-")
	return "--" + encoded + "--"
}

func ReadSessionHistory(projectPath string) ([]HistoricalSession, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}

	dir := filepath.Join(home, ".pi", "agent", "sessions", pathToSessionDir(projectPath))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var sessions []HistoricalSession
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}

		fullPath := filepath.Join(dir, entry.Name())
		s, err := parseSessionFile(fullPath)
		if err != nil {
			continue
		}
		s.FilePath = fullPath
		sessions = append(sessions, s)
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Timestamp.After(sessions[j].Timestamp)
	})

	if len(sessions) > 50 {
		sessions = sessions[:50]
	}
	return sessions, nil
}

func ReadSessionHistoryFromBase(baseDir, projectPath string) ([]HistoricalSession, error) {
	dir := filepath.Join(baseDir, pathToSessionDir(projectPath))
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}

	var sessions []HistoricalSession
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".jsonl") {
			continue
		}

		fullPath := filepath.Join(dir, entry.Name())
		s, err := parseSessionFile(fullPath)
		if err != nil {
			continue
		}
		s.FilePath = fullPath
		sessions = append(sessions, s)
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Timestamp.After(sessions[j].Timestamp)
	})

	if len(sessions) > 50 {
		sessions = sessions[:50]
	}
	return sessions, nil
}

func parseSessionFile(path string) (HistoricalSession, error) {
	f, err := os.Open(path)
	if err != nil {
		return HistoricalSession{}, err
	}
	defer f.Close()

	var result HistoricalSession
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 256*1024), 1024*1024)

	linesRead := 0
	for scanner.Scan() && linesRead < 20 {
		linesRead++
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var env struct {
			Type string `json:"type"`
		}
		if json.Unmarshal(line, &env) != nil {
			continue
		}

		switch env.Type {
		case "session":
			var s struct {
				ID        string `json:"id"`
				CWD       string `json:"cwd"`
				Timestamp string `json:"timestamp"`
			}
			if json.Unmarshal(line, &s) != nil {
				continue
			}
			t, err := time.Parse(time.RFC3339Nano, s.Timestamp)
			if err != nil {
				continue
			}
			result.ID = s.ID
			result.CWD = s.CWD
			result.Timestamp = t

		case "model_change":
			if result.Model != "" {
				continue
			}
			var m struct {
				ModelID string `json:"modelId"`
			}
			if json.Unmarshal(line, &m) != nil {
				continue
			}
			result.Model = m.ModelID

		case "message":
			if result.Topic != "" {
				continue
			}
			var msg struct {
				Message struct {
					Role    string `json:"role"`
					Content json.RawMessage `json:"content"`
				} `json:"message"`
			}
			if json.Unmarshal(line, &msg) != nil {
				continue
			}
			if msg.Message.Role != "user" {
				continue
			}
			result.Topic = extractTopicText(msg.Message.Content)
		}
	}

	if result.ID == "" {
		return HistoricalSession{}, os.ErrInvalid
	}
	return result, nil
}

func extractTopicText(content json.RawMessage) string {
	var parts []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	}
	if json.Unmarshal(content, &parts) == nil {
		for _, p := range parts {
			if p.Type == "text" && p.Text != "" {
				return truncate(p.Text, 100)
			}
		}
	}

	var text string
	if json.Unmarshal(content, &text) == nil {
		return truncate(text, 100)
	}
	return ""
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}
