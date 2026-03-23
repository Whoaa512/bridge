import { createRoot } from "react-dom/client";
import App from "./App";
import { initCanvas, type FilterMode } from "./canvas/bridge";
import { connectWS } from "./core/ws";
import { loadSpec } from "./core/loader";
import { showLoading, hideLoading, updateLoading, showEmpty, hideEmpty } from "./ui";
import { useBridgeStore, type View } from "./store";
import { setWSHandle } from "./agent/commands";
import type { AgentEvent } from "./agent/types";

const CANVAS_VIEWS: Set<View> = new Set(["complexity"]);

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
createRoot(appEl).render(<App />);

const canvas = document.getElementById("colony") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element not found");

const handle = initCanvas(canvas);

const initialView = useBridgeStore.getState().activeView;
handle.setVisible(CANVAS_VIEWS.has(initialView));

const FILTER_BY_VIEW: Record<View, FilterMode> = {
  complexity: "default",
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

function getLastAssistantMessageId(sessionId: string): string | null {
  const list = useBridgeStore.getState().messages.get(sessionId);
  if (!list) return null;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].role === "assistant") return list[i].id;
  }
  return null;
}

function handlePiEvent(sessionId: string, event: AgentEvent) {
  try {
    handlePiEventInner(sessionId, event);
  } catch (err) {
    console.warn("handlePiEvent error:", err, event);
  }
}

function handlePiEventInner(sessionId: string, event: AgentEvent) {
  const store = useBridgeStore.getState();

  const newState = sessionStateFromEvent(event);
  if (newState) store.updateSessionState(sessionId, newState);

  switch (event.type) {
    case "agent_start":
      store.addMessage(sessionId, {
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
        toolCalls: [],
        isStreaming: true,
        startedAt: Date.now(),
      });
      break;

    case "agent_end":
      store.updateLastMessage(sessionId, (msg) => ({ ...msg, isStreaming: false, completedAt: Date.now() }));
      break;

    case "message_update": {
      const ame = event.assistantMessageEvent;
      if (ame?.type === "text_delta") {
        store.updateLastMessage(sessionId, (msg) => ({
          ...msg,
          content: msg.content + ame.delta,
        }));
      }
      break;
    }

    case "tool_execution_start": {
      const msgId = getLastAssistantMessageId(sessionId);
      if (!msgId) break;
      store.addToolCall(sessionId, msgId, {
        id: event.toolCallId,
        name: event.toolName,
        args: typeof event.args === "string" ? event.args : JSON.stringify(event.args, null, 2),
      });
      break;
    }

    case "tool_execution_end": {
      const msgId = getLastAssistantMessageId(sessionId);
      if (!msgId) break;
      const result = typeof event.result === "string" ? event.result : JSON.stringify(event.result, null, 2);
      store.updateToolCall(sessionId, msgId, event.toolCallId, {
        result,
        isError: event.isError,
      });
      break;
    }
  }
}

const ws = connectWS({
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
    const store = useBridgeStore.getState();
    store.addSession(session);
    store.setActiveSessionId(session.id);
    if (session.projectId && !store.expandedProjects.has(session.projectId)) {
      store.toggleProjectExpanded(session.projectId);
    }
  },
  onSessionDestroyed: (sessionId) => {
    useBridgeStore.getState().removeSession(sessionId);
  },
  onSessionExit: (sessionId) => {
    useBridgeStore.getState().removeSession(sessionId);
  },
  onSessionError: (sessionId, error) => {
    console.warn(`session ${sessionId} error: ${error}`);
  },
  onSessionsList: (sessions) => {
    useBridgeStore.getState().setSessions(sessions);
  },
  onPiEvent: handlePiEvent,
  onExtensionUIRequest: (sessionId, request) => {
    const interactive = request.method === "select" || request.method === "confirm"
      || request.method === "input" || request.method === "notify";
    if (!interactive) return;
    useBridgeStore.getState().setExtensionUIRequest({ sessionId, request });
  },
  onConfigUpdate: (focusedProjects, pinnedProjects) => {
    const store = useBridgeStore.getState();
    store.setFocusedPaths(focusedProjects);
    store.setPinnedPaths(pinnedProjects);
  },
  onProjectSearchResults: (results) => {
    useBridgeStore.getState().setProjectSearchResults(results);
  },
  onSessionHistoryResults: (path, sessions) => {
    useBridgeStore.getState().setSessionHistory(path, sessions);
  },
});

setWSHandle(ws);

export { ws };

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    ws.close();
    handle.destroy();
  });
}
