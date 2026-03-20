export type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface Model {
  provider: string;
  modelId: string;
  name?: string;
}

export interface RpcSessionState {
  model?: Model;
  thinkingLevel: ThinkingLevel;
  isStreaming: boolean;
  isCompacting: boolean;
  steeringMode: "all" | "one-at-a-time";
  followUpMode: "all" | "one-at-a-time";
  sessionFile?: string;
  sessionId: string;
  sessionName?: string;
  autoCompactionEnabled: boolean;
  messageCount: number;
  pendingMessageCount: number;
}

export interface RpcResponse {
  id?: string;
  type: "response";
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export type AssistantMessageEvent =
  | { type: "text_delta"; delta: string }
  | { type: "thinking_delta"; delta: string }
  | { type: "toolcall_start"; toolCallId: string; toolName: string }
  | { type: "toolcall_delta"; toolCallId: string; delta: string }
  | { type: "toolcall_end"; toolCallId: string }
  | { type: "stop"; stopReason: string; usage?: unknown };

export type AgentEvent =
  | { type: "agent_start" }
  | { type: "agent_end"; messages: unknown[] }
  | { type: "turn_start" }
  | { type: "turn_end"; message: unknown; toolResults: unknown[] }
  | { type: "message_start"; message: unknown }
  | { type: "message_update"; message: unknown; assistantMessageEvent: AssistantMessageEvent }
  | { type: "message_end"; message: unknown }
  | { type: "tool_execution_start"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool_execution_update"; toolCallId: string; toolName: string; args: unknown; partialResult: unknown }
  | { type: "tool_execution_end"; toolCallId: string; toolName: string; result: unknown; isError: boolean };

export type AgentSessionEvent =
  | AgentEvent
  | { type: "auto_compaction"; result: unknown }
  | { type: "retry"; attempt: number; maxAttempts: number; delay: number };

export type ExtensionUIRequest =
  | { type: "extension_ui_request"; id: string; method: "select"; title: string; options: string[]; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "confirm"; title: string; message: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "input"; title: string; placeholder?: string; timeout?: number }
  | { type: "extension_ui_request"; id: string; method: "notify"; message: string; notifyType?: "info" | "warning" | "error" }
  | { type: "extension_ui_request"; id: string; method: "setStatus"; statusKey: string; statusText?: string }
  | { type: "extension_ui_request"; id: string; method: "setTitle"; title: string };
