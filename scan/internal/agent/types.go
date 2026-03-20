package agent

import "encoding/json"

type RpcCommand struct {
	ID   string `json:"id,omitempty"`
	Type string `json:"type"`

	// prompt/steer/follow_up
	Message string `json:"message,omitempty"`

	// set_model
	Provider string `json:"provider,omitempty"`
	ModelID  string `json:"modelId,omitempty"`

	// set_thinking_level
	Level string `json:"level,omitempty"`

	// set_auto_compaction / set_auto_retry
	Enabled *bool `json:"enabled,omitempty"`

	// set_steering_mode / set_follow_up_mode
	Mode string `json:"mode,omitempty"`

	// bash
	Command string `json:"command,omitempty"`

	// compact
	CustomInstructions string `json:"customInstructions,omitempty"`

	// switch_session
	SessionPath string `json:"sessionPath,omitempty"`

	// fork
	EntryID string `json:"entryId,omitempty"`

	// set_session_name
	Name string `json:"name,omitempty"`

	// new_session
	ParentSession string `json:"parentSession,omitempty"`

	// extension_ui_response
	Value     string `json:"value,omitempty"`
	Confirmed *bool  `json:"confirmed,omitempty"`
	Cancelled *bool  `json:"cancelled,omitempty"`
}

type RpcResponse struct {
	ID      string          `json:"id,omitempty"`
	Type    string          `json:"type"`
	Command string          `json:"command"`
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   string          `json:"error,omitempty"`
}

type RpcSessionState struct {
	IsStreaming            bool            `json:"isStreaming"`
	IsCompacting           bool            `json:"isCompacting"`
	ThinkingLevel          string          `json:"thinkingLevel"`
	SteeringMode           string          `json:"steeringMode"`
	FollowUpMode           string          `json:"followUpMode"`
	SessionID              string          `json:"sessionId"`
	SessionName            string          `json:"sessionName,omitempty"`
	SessionFile            string          `json:"sessionFile,omitempty"`
	AutoCompactionEnabled  bool            `json:"autoCompactionEnabled"`
	MessageCount           int             `json:"messageCount"`
	PendingMessageCount    int             `json:"pendingMessageCount"`
	Model                  json.RawMessage `json:"model,omitempty"`
}

type AgentEvent struct {
	Type string          `json:"type"`
	Raw  json.RawMessage `json:"-"`
}

func (e *AgentEvent) UnmarshalJSON(data []byte) error {
	var obj struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		return err
	}
	e.Type = obj.Type
	e.Raw = json.RawMessage(data)
	return nil
}

func (e AgentEvent) MarshalJSON() ([]byte, error) {
	if e.Raw != nil {
		return e.Raw, nil
	}
	return json.Marshal(struct {
		Type string `json:"type"`
	}{Type: e.Type})
}

type ExtensionUIRequest struct {
	Type    string `json:"type"`
	ID      string `json:"id"`
	Method  string `json:"method"`
	Title   string `json:"title,omitempty"`
	Message string `json:"message,omitempty"`
	Options []string `json:"options,omitempty"`
	Timeout int    `json:"timeout,omitempty"`
}

type ExtensionUIResponse struct {
	Type      string `json:"type"`
	ID        string `json:"id"`
	Value     string `json:"value,omitempty"`
	Confirmed *bool  `json:"confirmed,omitempty"`
	Cancelled *bool  `json:"cancelled,omitempty"`
}

func ClassifyOutput(data json.RawMessage) string {
	var obj struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(data, &obj); err != nil {
		return "unknown"
	}
	switch obj.Type {
	case "response":
		return "response"
	case "extension_ui_request":
		return "extension_ui_request"
	default:
		return "event"
	}
}
