package agent

import (
	"encoding/json"
	"testing"
)

func TestRpcCommandMarshal(t *testing.T) {
	cmd := RpcCommand{
		Type:    "prompt",
		Message: "hello world",
	}
	data, err := json.Marshal(cmd)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var parsed map[string]interface{}
	json.Unmarshal(data, &parsed)
	if parsed["type"] != "prompt" {
		t.Errorf("type = %v, want prompt", parsed["type"])
	}
	if parsed["message"] != "hello world" {
		t.Errorf("message = %v", parsed["message"])
	}
	if _, ok := parsed["id"]; ok {
		t.Error("id should be omitted when empty")
	}
}

func TestRpcCommandWithID(t *testing.T) {
	cmd := RpcCommand{
		ID:   "req-1",
		Type: "get_state",
	}
	data, _ := json.Marshal(cmd)
	var parsed map[string]interface{}
	json.Unmarshal(data, &parsed)
	if parsed["id"] != "req-1" {
		t.Errorf("id = %v, want req-1", parsed["id"])
	}
}

func TestRpcResponseUnmarshal(t *testing.T) {
	raw := `{"type":"response","command":"get_state","success":true,"data":{"isStreaming":false,"thinkingLevel":"medium","sessionId":"abc"}}`
	var resp RpcResponse
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Type != "response" {
		t.Errorf("type = %q", resp.Type)
	}
	if resp.Command != "get_state" {
		t.Errorf("command = %q", resp.Command)
	}
	if !resp.Success {
		t.Error("expected success=true")
	}

	var state RpcSessionState
	if err := json.Unmarshal(resp.Data, &state); err != nil {
		t.Fatalf("unmarshal state: %v", err)
	}
	if state.SessionID != "abc" {
		t.Errorf("sessionId = %q", state.SessionID)
	}
	if state.ThinkingLevel != "medium" {
		t.Errorf("thinkingLevel = %q", state.ThinkingLevel)
	}
}

func TestRpcResponseError(t *testing.T) {
	raw := `{"type":"response","command":"prompt","success":false,"error":"not ready"}`
	var resp RpcResponse
	if err := json.Unmarshal([]byte(raw), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Success {
		t.Error("expected success=false")
	}
	if resp.Error != "not ready" {
		t.Errorf("error = %q", resp.Error)
	}
}

func TestAgentEventUnmarshal(t *testing.T) {
	raw := `{"type":"agent_start"}`
	var ev AgentEvent
	if err := json.Unmarshal([]byte(raw), &ev); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if ev.Type != "agent_start" {
		t.Errorf("type = %q", ev.Type)
	}
	if string(ev.Raw) != raw {
		t.Errorf("raw = %q, want %q", string(ev.Raw), raw)
	}
}

func TestAgentEventRoundtrip(t *testing.T) {
	raw := `{"type":"message_update","message":{"role":"assistant"},"assistantMessageEvent":{"type":"text_delta","delta":"hi"}}`
	var ev AgentEvent
	json.Unmarshal([]byte(raw), &ev)

	out, err := json.Marshal(ev)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if string(out) != raw {
		t.Errorf("roundtrip mismatch:\n  got:  %s\n  want: %s", out, raw)
	}
}

func TestClassifyOutput(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{`{"type":"response","command":"get_state","success":true}`, "response"},
		{`{"type":"extension_ui_request","id":"1","method":"confirm"}`, "extension_ui_request"},
		{`{"type":"agent_start"}`, "event"},
		{`{"type":"message_update"}`, "event"},
		{`not json`, "unknown"},
	}
	for _, tt := range tests {
		got := ClassifyOutput(json.RawMessage(tt.input))
		if got != tt.want {
			t.Errorf("ClassifyOutput(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestExtensionUIRequestUnmarshal(t *testing.T) {
	raw := `{"type":"extension_ui_request","id":"ext-1","method":"confirm","title":"Allow?","message":"Run this?"}`
	var req ExtensionUIRequest
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if req.ID != "ext-1" {
		t.Errorf("id = %q", req.ID)
	}
	if req.Method != "confirm" {
		t.Errorf("method = %q", req.Method)
	}
}
