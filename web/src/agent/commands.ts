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

export function sendProjectOptIn(projectId: string) {
  _ws?.send({ type: "project_opt_in", projectId });
}

export function sendProjectOptOut(projectId: string) {
  _ws?.send({ type: "project_opt_out", projectId });
}

export function sendProjectPin(projectId: string) {
  _ws?.send({ type: "project_pin", projectId });
}

export function sendProjectUnpin(projectId: string) {
  _ws?.send({ type: "project_unpin", projectId });
}
