package agent

import (
	"bytes"
	"encoding/json"
	"io"
	"strings"
	"testing"
)

func TestJSONLReaderBasic(t *testing.T) {
	input := `{"type":"agent_start"}
{"type":"agent_end","messages":[]}
`
	r := NewJSONLReader(strings.NewReader(input))

	line1, err := r.Read()
	if err != nil {
		t.Fatalf("read 1: %v", err)
	}
	if !json.Valid(line1) {
		t.Errorf("line 1 not valid JSON: %s", line1)
	}

	line2, err := r.Read()
	if err != nil {
		t.Fatalf("read 2: %v", err)
	}
	if !json.Valid(line2) {
		t.Errorf("line 2 not valid JSON: %s", line2)
	}

	_, err = r.Read()
	if err != io.EOF {
		t.Errorf("expected EOF, got %v", err)
	}
}

func TestJSONLReaderSkipsEmptyLines(t *testing.T) {
	input := "\n{\"type\":\"test\"}\n\n"
	r := NewJSONLReader(strings.NewReader(input))

	line, err := r.Read()
	if err != nil {
		t.Fatalf("read: %v", err)
	}

	var obj struct{ Type string `json:"type"` }
	json.Unmarshal(line, &obj)
	if obj.Type != "test" {
		t.Errorf("type = %q, want test", obj.Type)
	}

	_, err = r.Read()
	if err != io.EOF {
		t.Errorf("expected EOF, got %v", err)
	}
}

func TestJSONLWriterBasic(t *testing.T) {
	var buf bytes.Buffer
	w := NewJSONLWriter(&buf)

	cmd := RpcCommand{Type: "get_state"}
	if err := w.Write(cmd); err != nil {
		t.Fatalf("write: %v", err)
	}

	output := buf.String()
	if !strings.HasSuffix(output, "\n") {
		t.Error("output should end with newline")
	}

	trimmed := strings.TrimSpace(output)
	if !json.Valid([]byte(trimmed)) {
		t.Errorf("output not valid JSON: %s", trimmed)
	}
}

func TestJSONLRoundtrip(t *testing.T) {
	var buf bytes.Buffer
	w := NewJSONLWriter(&buf)

	commands := []RpcCommand{
		{Type: "prompt", Message: "hello"},
		{Type: "get_state"},
		{Type: "abort"},
	}
	for _, cmd := range commands {
		if err := w.Write(cmd); err != nil {
			t.Fatalf("write: %v", err)
		}
	}

	r := NewJSONLReader(&buf)
	for i, want := range commands {
		raw, err := r.Read()
		if err != nil {
			t.Fatalf("read %d: %v", i, err)
		}
		var got RpcCommand
		if err := json.Unmarshal(raw, &got); err != nil {
			t.Fatalf("unmarshal %d: %v", i, err)
		}
		if got.Type != want.Type {
			t.Errorf("line %d: type = %q, want %q", i, got.Type, want.Type)
		}
		if got.Message != want.Message {
			t.Errorf("line %d: message = %q, want %q", i, got.Message, want.Message)
		}
	}

	_, err := r.Read()
	if err != io.EOF {
		t.Errorf("expected EOF, got %v", err)
	}
}

func TestJSONLWriterConcurrentSafe(t *testing.T) {
	var buf bytes.Buffer
	w := NewJSONLWriter(&buf)

	done := make(chan struct{})
	for i := 0; i < 10; i++ {
		go func(n int) {
			defer func() { done <- struct{}{} }()
			w.Write(RpcCommand{Type: "prompt", Message: "msg"})
		}(i)
	}
	for i := 0; i < 10; i++ {
		<-done
	}

	r := NewJSONLReader(&buf)
	count := 0
	for {
		_, err := r.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatalf("read: %v", err)
		}
		count++
	}
	if count != 10 {
		t.Errorf("count = %d, want 10", count)
	}
}
