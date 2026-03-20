import { createRoot } from "react-dom/client";
import App from "./App";
import { initCanvas } from "./canvas/bridge";
import { connectWS } from "./core/ws";
import { useBridgeStore } from "./store";

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
createRoot(appEl).render(<App />);

const canvas = document.getElementById("colony") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element not found");

const handle = initCanvas(canvas);

connectWS({
  onSpec: (spec) => {
    useBridgeStore.getState().setSpec(spec);
    handle.updateSpec(spec);
  },
  onDisconnect: () => {
    useBridgeStore.getState().setWsConnected(false);
  },
  onReconnect: () => {
    useBridgeStore.getState().setWsConnected(true);
  },
});
