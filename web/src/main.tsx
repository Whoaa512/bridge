import { createRoot } from "react-dom/client";
import App from "./App";
import { initCanvas, type FilterMode } from "./canvas/bridge";
import { connectWS, type WSHandle } from "./core/ws";
import { loadSpec } from "./core/loader";
import { showLoading, hideLoading, updateLoading, showEmpty, hideEmpty } from "./ui";
import { useBridgeStore, type View } from "./store";
import type { AgentEvent } from "./agent/types";

const CANVAS_VIEWS: Set<View> = new Set(["complexity", "colony"]);

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
createRoot(appEl).render(<App />);

const canvas = document.getElementById("colony") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element not found");

const handle = initCanvas(canvas);

const FILTER_BY_VIEW: Record<View, FilterMode> = {
  complexity: "default",
  colony: "all",
  workspace: "default",
  sessions: "default",
};

useBridgeStore.subscribe(
  (state, prev) => {
    if (state.activeView === prev.activeView) return;
    handle.setVisible(CANVAS_VIEWS.has(state.activeView));
    handle.setFilterMode(FILTER_BY_VIEW[state.activeView]);
  },
);

showLoading();
loadSpec((msg) => updateLoading(msg))
  .then((spec) => {
    hideLoading();
    if (spec.projects.length === 0) {
      showEmpty();
    }
    useBridgeStore.getState().setSpec(spec);
    handle.updateSpec(spec);
  })
  .catch((err) => {
    hideLoading();
    const root = document.getElementById("ui-root");
    if (root) {
      const div = document.createElement("div");
      div.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#f85149;font-size:16px;font-family:system-ui;text-align:center;max-width:400px;";
      div.textContent = `Failed to connect to Bridge scanner. Is \`bridge serve\` running?\n\n${err}`;
      root.appendChild(div);
    }
  });

function sessionStateFromEvent(event: AgentEvent): "idle" | "streaming" | "compacting" | null {
  switch (event.type) {
    case "agent_start": return "streaming";
    case "agent_end": return "idle";
    default: return null;
  }
}

const ws: WSHandle = connectWS({
  onSpec: (spec) => {
    hideEmpty();
    const store = useBridgeStore.getState();
    store.setSpec(spec);
    store.setWsConnected(true);
    handle.updateSpec(spec);
  },
  onDisconnect: () => {
    useBridgeStore.getState().setWsConnected(false);
  },
  onReconnect: () => {
    useBridgeStore.getState().setWsConnected(true);
  },
  onSessionCreated: (session) => {
    useBridgeStore.getState().addSession(session);
  },
  onSessionDestroyed: (sessionId) => {
    useBridgeStore.getState().removeSession(sessionId);
  },
  onSessionError: (sessionId) => {
    useBridgeStore.getState().removeSession(sessionId);
  },
  onSessionsList: (sessions) => {
    useBridgeStore.getState().setSessions(sessions);
  },
  onPiEvent: (sessionId, event) => {
    const newState = sessionStateFromEvent(event);
    if (newState) {
      useBridgeStore.getState().updateSessionState(sessionId, newState);
    }
  },
});

export { ws };

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    ws.close();
    handle.destroy();
  });
}
