import { create } from "zustand";
import type { BridgeSpec } from "./core/types";

export type View = "complexity" | "workspace" | "colony" | "sessions";

export interface BridgeStore {
  spec: BridgeSpec | null;
  setSpec: (spec: BridgeSpec) => void;
  activeView: View;
  setActiveView: (view: View) => void;
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;
}

export const useBridgeStore = create<BridgeStore>((set) => ({
  spec: null,
  setSpec: (spec) => set({ spec }),
  activeView: "complexity",
  setActiveView: (activeView) => set({ activeView }),
  wsConnected: false,
  setWsConnected: (wsConnected) => set({ wsConnected }),
}));
