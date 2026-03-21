import type { AgentEvent, RpcResponse, ExtensionUIRequest } from "./types";

export interface SessionInfo {
  id: string;
  cwd: string;
  projectId: string;
  model: string;
  state: "idle" | "streaming" | "compacting";
}

export interface HistoricalSession {
  id: string;
  cwd: string;
  timestamp: string;
  model: string;
  topic: string;
  filePath: string;
}

export type BridgeWSCommand =
  | { type: "session_create"; cwd: string; model?: string; projectId?: string }
  | { type: "session_destroy"; sessionId: string }
  | { type: "sessions_list_request" }
  | { type: "pi_command"; sessionId: string; command: object }
  | { type: "extension_ui_response"; sessionId: string; response: object }
  | { type: "project_opt_in"; path: string }
  | { type: "project_opt_out"; path: string }
  | { type: "project_pin"; path: string }
  | { type: "project_unpin"; path: string }
  | { type: "project_search"; query: string }
  | { type: "session_history"; path: string }
  | { type: "session_resume"; cwd: string; projectId: string; filePath: string };

export type BridgeWSEvent =
  | { type: "full_sync"; spec: unknown }
  | { type: "session_created"; session: SessionInfo }
  | { type: "session_destroyed"; sessionId: string }
  | { type: "session_exit"; sessionId: string; exitCode?: number }
  | { type: "session_error"; sessionId: string; error: string }
  | { type: "sessions_list"; sessions: SessionInfo[] }
  | { type: "pi_event"; sessionId: string; event: AgentEvent }
  | { type: "pi_response"; sessionId: string; response: RpcResponse }
  | { type: "extension_ui_request"; sessionId: string; request: ExtensionUIRequest }
  | { type: "config_update"; focusedProjects: string[]; pinnedProjects: string[] }
  | { type: "project_search_results"; results: Array<{ name: string; path: string }> }
  | { type: "session_history_results"; path: string; sessions: HistoricalSession[] }
  | { type: "error"; error: string };
