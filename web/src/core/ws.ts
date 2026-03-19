import type { BridgeSpec } from "./types";

export interface WSCallbacks {
  onSpec: (spec: BridgeSpec) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
}

const MAX_BACKOFF = 30_000;

export function connectWS(callbacks: WSCallbacks): { close: () => void } {
  let ws: WebSocket | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let backoff = 1000;
  let wasConnected = false;

  function getURL(): string {
    const proto = location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${location.host}/ws`;
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
        const msg = JSON.parse(e.data);
        if (msg.type === "full_sync" && msg.spec) {
          callbacks.onSpec(msg.spec);
        }
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
  };
}
