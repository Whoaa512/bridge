import { create } from "zustand";
import type { BridgeSpec } from "./core/types";
import type { SessionInfo } from "./agent/ws-types";

export type View = "complexity" | "workspace" | "colony" | "sessions";

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
}

export const useBridgeStore = create<BridgeStore>((set, get) => ({
  spec: null,
  setSpec: (spec) => set({ spec }),
  activeView: "complexity",
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
    set({ sessions: next });
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
}));
