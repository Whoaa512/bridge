import { createRoot } from "react-dom/client";
import App from "./App";
import { initCanvas } from "./canvas/bridge";
import { connectWS } from "./core/ws";
import { loadSpec } from "./core/loader";
import { showLoading, hideLoading, updateLoading, showEmpty, hideEmpty } from "./ui";
import { useBridgeStore, type View } from "./store";

const CANVAS_VIEWS: Set<View> = new Set(["complexity", "colony"]);

const appEl = document.getElementById("app");
if (!appEl) throw new Error("#app not found");
createRoot(appEl).render(<App />);

const canvas = document.getElementById("colony") as HTMLCanvasElement;
if (!canvas) throw new Error("Canvas element not found");

const handle = initCanvas(canvas);

useBridgeStore.subscribe(
  (state, prev) => {
    if (state.activeView === prev.activeView) return;
    handle.setVisible(CANVAS_VIEWS.has(state.activeView));
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

connectWS({
  onSpec: (spec) => {
    hideEmpty();
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
