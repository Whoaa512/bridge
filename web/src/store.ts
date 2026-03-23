import { create } from "zustand";
import type { BridgeSpec } from "./core/types";
import type { SessionInfo, HistoricalSession } from "./agent/ws-types";
import type { ExtensionUIRequest } from "./agent/types";

export type View = "complexity" | "workspace" | "sessions";

export interface ToolCallInfo {
  id: string;
  name: string;
  args: string;
  result?: string;
  isError?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
  startedAt?: number;
  completedAt?: number;
}

export interface BridgeStore {
  spec: BridgeSpec | null;
  setSpec: (spec: BridgeSpec) => void;
  activeView: View;
  setActiveView: (view: View) => void;
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;
  sessions: Map<string, SessionInfo>;
  addSession: (session: SessionInfo) => void;
  removeSession: (id: string) => void;
  updateSessionState: (id: string, state: SessionInfo["state"]) => void;
  setSessions: (sessions: SessionInfo[]) => void;

  messages: Map<string, ChatMessage[]>;
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  addMessage: (sessionId: string, message: ChatMessage) => void;
  updateLastMessage: (sessionId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  addToolCall: (sessionId: string, messageId: string, tool: ToolCallInfo) => void;
  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, update: Partial<ToolCallInfo>) => void;
  clearMessages: (sessionId: string) => void;

  extensionUIRequest: { sessionId: string; request: ExtensionUIRequest } | null;
  setExtensionUIRequest: (req: { sessionId: string; request: ExtensionUIRequest } | null) => void;

  expandedProjects: Set<string>;
  toggleProjectExpanded: (projectId: string) => void;

  focusedPaths: Set<string>;
  pinnedPaths: Set<string>;
  setFocusedPaths: (paths: string[]) => void;
  setPinnedPaths: (paths: string[]) => void;
  addFocusedPath: (path: string) => void;
  removeFocusedPath: (path: string) => void;
  togglePinPath: (path: string) => void;

  showProjectSearch: boolean;
  setShowProjectSearch: (show: boolean) => void;

  projectSearchResults: Array<{ name: string; path: string }>;
  setProjectSearchResults: (results: Array<{ name: string; path: string }>) => void;

  sessionHistory: Map<string, HistoricalSession[]>;
  setSessionHistory: (path: string, sessions: HistoricalSession[]) => void;

  sessionErrors: Map<string, string>;
  setSessionError: (sessionId: string, error: string | null) => void;

  sessionTopics: Map<string, string>;
  setSessionTopic: (sessionId: string, topic: string) => void;
  getAdjacentSessionId: (direction: "prev" | "next") => string | null;
}

export const useBridgeStore = create<BridgeStore>((set, get) => ({
  spec: null,
  setSpec: (spec) => set({ spec }),
  activeView: "sessions",
  setActiveView: (activeView) => set({ activeView }),
  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),
  sessions: new Map(),
  addSession: (session) => {
    const next = new Map(get().sessions);
    next.set(session.id, session);
    set({ sessions: next });
  },
  removeSession: (id) => {
    const next = new Map(get().sessions);
    next.delete(id);
    const msgs = new Map(get().messages);
    msgs.delete(id);
    const topics = new Map(get().sessionTopics);
    topics.delete(id);
    const activeSessionId = get().activeSessionId === id ? null : get().activeSessionId;
    set({ sessions: next, messages: msgs, sessionTopics: topics, activeSessionId });
  },
  updateSessionState: (id, state) => {
    const sessions = get().sessions;
    const existing = sessions.get(id);
    if (!existing) return;
    const next = new Map(sessions);
    next.set(id, { ...existing, state });
    set({ sessions: next });
  },
  setSessions: (list) => {
    const next = new Map<string, SessionInfo>();
    for (const s of list) {
      next.set(s.id, s);
    }
    set({ sessions: next });
  },

  messages: new Map(),
  activeSessionId: null,
  setActiveSessionId: (id) => set({ activeSessionId: id }),
  addMessage: (sessionId, message) => {
    const msgs = new Map(get().messages);
    const list = [...(msgs.get(sessionId) ?? []), message];
    msgs.set(sessionId, list);
    set({ messages: msgs });

    if (message.role === "user" && !get().sessionTopics.has(sessionId)) {
      const firstLine = message.content.split("\n")[0].trim();
      const topic = firstLine.length > 40 ? firstLine.slice(0, 40) + "…" : firstLine;
      if (topic) {
        const topics = new Map(get().sessionTopics);
        topics.set(sessionId, topic);
        set({ sessionTopics: topics });
      }
    }
  },
  updateLastMessage: (sessionId, updater) => {
    const msgs = new Map(get().messages);
    const list = msgs.get(sessionId);
    if (!list || list.length === 0) return;
    const updated = [...list];
    updated[updated.length - 1] = updater(updated[updated.length - 1]);
    msgs.set(sessionId, updated);
    set({ messages: msgs });
  },
  addToolCall: (sessionId, messageId, tool) => {
    const msgs = new Map(get().messages);
    const list = msgs.get(sessionId);
    if (!list) return;
    const updated = list.map((msg) => {
      if (msg.id !== messageId) return msg;
      return { ...msg, toolCalls: [...(msg.toolCalls ?? []), tool] };
    });
    msgs.set(sessionId, updated);
    set({ messages: msgs });
  },
  updateToolCall: (sessionId, messageId, toolCallId, update) => {
    const msgs = new Map(get().messages);
    const list = msgs.get(sessionId);
    if (!list) return;
    const updated = list.map((msg) => {
      if (msg.id !== messageId) return msg;
      const tools = (msg.toolCalls ?? []).map((tc) => {
        if (tc.id !== toolCallId) return tc;
        return { ...tc, ...update };
      });
      return { ...msg, toolCalls: tools };
    });
    msgs.set(sessionId, updated);
    set({ messages: msgs });
  },
  clearMessages: (sessionId) => {
    const msgs = new Map(get().messages);
    msgs.delete(sessionId);
    set({ messages: msgs });
  },

  extensionUIRequest: null,
  setExtensionUIRequest: (req) => set({ extensionUIRequest: req }),

  expandedProjects: new Set<string>(),
  toggleProjectExpanded: (projectId) => {
    const next = new Set(get().expandedProjects);
    if (next.has(projectId)) {
      next.delete(projectId);
    } else {
      next.add(projectId);
    }
    set({ expandedProjects: next });
  },

  focusedPaths: new Set<string>(),
  pinnedPaths: new Set<string>(),
  setFocusedPaths: (paths) => set({ focusedPaths: new Set(paths) }),
  setPinnedPaths: (paths) => set({ pinnedPaths: new Set(paths) }),
  addFocusedPath: (path) => {
    const next = new Set(get().focusedPaths);
    next.add(path);
    set({ focusedPaths: next });
  },
  removeFocusedPath: (path) => {
    const focused = new Set(get().focusedPaths);
    focused.delete(path);
    const pinned = new Set(get().pinnedPaths);
    pinned.delete(path);
    set({ focusedPaths: focused, pinnedPaths: pinned });
  },
  togglePinPath: (path) => {
    const next = new Set(get().pinnedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    set({ pinnedPaths: next });
  },

  showProjectSearch: false,
  setShowProjectSearch: (show) => set({ showProjectSearch: show }),

  projectSearchResults: [],
  setProjectSearchResults: (results) => set({ projectSearchResults: results }),

  sessionHistory: new Map(),
  setSessionHistory: (path, sessions) => {
    const next = new Map(get().sessionHistory);
    next.set(path, sessions);
    set({ sessionHistory: next });
  },

  sessionErrors: new Map(),
  setSessionError: (sessionId, error) => {
    const next = new Map(get().sessionErrors);
    if (error === null) {
      next.delete(sessionId);
    } else {
      next.set(sessionId, error);
    }
    set({ sessionErrors: next });
  },

  sessionTopics: new Map(),
  setSessionTopic: (sessionId, topic) => {
    const next = new Map(get().sessionTopics);
    next.set(sessionId, topic);
    set({ sessionTopics: next });
  },
  getAdjacentSessionId: (direction) => {
    const { sessions, activeSessionId } = get();
    const ids = [...sessions.keys()];
    if (ids.length === 0) return null;
    if (!activeSessionId) return ids[0];
    const idx = ids.indexOf(activeSessionId);
    if (idx === -1) return ids[0];
    const next = direction === "next" ? idx + 1 : idx - 1;
    if (next < 0 || next >= ids.length) return null;
    return ids[next];
  },
}));
