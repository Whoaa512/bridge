import type { WSHandle } from "../core/ws";

let _ws: WSHandle | null = null;

export function setWSHandle(ws: WSHandle) {
  _ws = ws;
}

export function sendCommand(sessionId: string, command: object) {
  _ws?.send({ type: "pi_command", sessionId, command });
}

export function sendExtensionUIResponse(sessionId: string, response: object) {
  _ws?.send({ type: "extension_ui_response", sessionId, response });
}

export function sendSessionCreate(cwd: string, projectId?: string) {
  _ws?.send({ type: "session_create", cwd, projectId });
}

export function sendSessionDestroy(sessionId: string) {
  _ws?.send({ type: "session_destroy", sessionId });
}

export function sendProjectOptIn(path: string) {
  _ws?.send({ type: "project_opt_in", path });
}

export function sendProjectOptOut(path: string) {
  _ws?.send({ type: "project_opt_out", path });
}

export function sendProjectPin(path: string) {
  _ws?.send({ type: "project_pin", path });
}

export function sendProjectUnpin(path: string) {
  _ws?.send({ type: "project_unpin", path });
}

export function sendProjectSearch(query: string) {
  _ws?.send({ type: "project_search", query });
}

export function sendSessionHistory(path: string) {
  _ws?.send({ type: "session_history", path });
}
