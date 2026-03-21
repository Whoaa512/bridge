import type { BridgeSpec } from "./types";
import type { SessionInfo, HistoricalSession } from "../agent/ws-types";
import type { AgentEvent, RpcResponse, ExtensionUIRequest } from "../agent/types";
import { cacheSpec } from "./loader";

export interface WSCallbacks {
  onSpec: (spec: BridgeSpec) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  onSessionCreated?: (session: SessionInfo) => void;
  onSessionDestroyed?: (sessionId: string) => void;
  onSessionExit?: (sessionId: string) => void;
  onSessionError?: (sessionId: string, error: string) => void;
  onSessionsList?: (sessions: SessionInfo[]) => void;
  onPiEvent?: (sessionId: string, event: AgentEvent) => void;
  onPiResponse?: (sessionId: string, response: RpcResponse) => void;
  onExtensionUIRequest?: (sessionId: string, request: ExtensionUIRequest) => void;
  onConfigUpdate?: (focusedProjects: string[], pinnedProjects: string[]) => void;
  onProjectSearchResults?: (results: Array<{ name: string; path: string }>) => void;
  onSessionHistoryResults?: (path: string, sessions: HistoricalSession[]) => void;
}

export interface WSHandle {
  close: () => void;
  send: (msg: object) => void;
}

const MAX_BACKOFF = 30_000;

export function connectWS(callbacks: WSCallbacks): WSHandle {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1000;
  let wasConnected = false;

  function getURL(): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
  }

  function routeMessage(msg: any) {
    switch (msg.type) {
      case "full_sync":
        if (msg.spec) {
          cacheSpec(msg.spec);
          callbacks.onSpec(msg.spec);
        }
        break;
      case "session_created":
        callbacks.onSessionCreated?.(msg.session);
        break;
      case "session_destroyed":
        callbacks.onSessionDestroyed?.(msg.sessionId);
        break;
      case "session_exit":
        callbacks.onSessionExit?.(msg.sessionId);
        break;
      case "session_error":
        callbacks.onSessionError?.(msg.sessionId, msg.error);
        break;
      case "sessions_list":
        callbacks.onSessionsList?.(msg.sessions);
        break;
      case "pi_event":
        callbacks.onPiEvent?.(msg.sessionId, msg.event);
        break;
      case "pi_response":
        callbacks.onPiResponse?.(msg.sessionId, msg.response);
        break;
      case "extension_ui_request":
        callbacks.onExtensionUIRequest?.(msg.sessionId, msg.request);
        break;
      case "config_update":
        callbacks.onConfigUpdate?.(msg.focusedProjects, msg.pinnedProjects);
        break;
      case "project_search_results":
        callbacks.onProjectSearchResults?.(msg.results);
        break;
      case "session_history_results":
        callbacks.onSessionHistoryResults?.(msg.path, msg.sessions);
        break;
    }
  }

  function connect() {
    if (closed) return;

    ws = new WebSocket(getURL());

    ws.onopen = () => {
      backoff = 1000;
      if (wasConnected) {
        callbacks.onReconnect();
      }
      wasConnected = true;
    };

    ws.onmessage = (e) => {
      try {
        routeMessage(JSON.parse(e.data));
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      ws = null;
      if (closed) return;
      callbacks.onDisconnect();
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  function scheduleReconnect() {
    if (closed) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
      connect();
    }, backoff);
  }

  connect();

  return {
    close() {
      closed = true;
      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      ws?.close();
      ws = null;
    },
    send(msg: object) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
  };
}
