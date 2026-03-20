package agent

import (
	"encoding/json"
	"os/exec"
	"testing"
	"time"
)

func TestCompatPiGetState(t *testing.T) {
	if _, err := exec.LookPath("pi"); err != nil {
		t.Skip("pi not found on PATH")
	}

	dir := t.TempDir()
	cmd := exec.Command("pi", "--mode", "rpc")
	cmd.Dir = dir

	stdin, err := cmd.StdinPipe()
	if err != nil {
		t.Fatalf("stdin pipe: %v", err)
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatalf("stdout pipe: %v", err)
	}

	if err := cmd.Start(); err != nil {
		t.Fatalf("start: %v", err)
	}
	defer func() {
		stdin.Close()
		cmd.Process.Kill()
		cmd.Wait()
	}()

	time.Sleep(500 * time.Millisecond)

	writer := NewJSONLWriter(stdin)
	reader := NewJSONLReader(stdout)

	getState := RpcCommand{
		ID:   "compat-test-1",
		Type: "get_state",
	}
	if err := writer.Write(getState); err != nil {
		t.Fatalf("write get_state: %v", err)
	}

	done := make(chan struct{})
	var readErr error
	var raw json.RawMessage

	go func() {
		defer close(done)
		for {
			line, err := reader.Read()
			if err != nil {
				readErr = err
				return
			}
			kind := ClassifyOutput(line)
			if kind == "response" {
				raw = line
				return
			}
		}
	}()

	select {
	case <-done:
	case <-time.After(10 * time.Second):
		t.Fatal("timeout waiting for get_state response")
	}

	if readErr != nil {
		t.Fatalf("read error: %v", readErr)
	}

	var resp RpcResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}

	if resp.Type != "response" {
		t.Errorf("type = %q, want response", resp.Type)
	}
	if resp.Command != "get_state" {
		t.Errorf("command = %q, want get_state", resp.Command)
	}
	if !resp.Success {
		t.Errorf("success = false, error = %q", resp.Error)
	}

	if resp.Data == nil {
		t.Fatal("data is nil")
	}

	var state RpcSessionState
	if err := json.Unmarshal(resp.Data, &state); err != nil {
		t.Fatalf("unmarshal state: %v", err)
	}

	if state.SessionID == "" {
		t.Error("sessionId is empty")
	}
	if state.ThinkingLevel == "" {
		t.Error("thinkingLevel is empty")
	}

	t.Logf("pi session state: id=%s, thinking=%s, streaming=%v",
		state.SessionID, state.ThinkingLevel, state.IsStreaming)
}
