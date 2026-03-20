import { initCanvas } from "./canvas/bridge";
import { connectWS } from "./core/ws";

function main() {
  const canvas = document.getElementById("colony") as HTMLCanvasElement;
  if (!canvas) throw new Error("Canvas element not found");

  const handle = initCanvas(canvas);

  connectWS({
    onSpec: (spec) => handle.updateSpec(spec),
    onDisconnect: () => console.log("[bridge] ws disconnected"),
    onReconnect: () => console.log("[bridge] ws reconnected"),
  });
}

main();
