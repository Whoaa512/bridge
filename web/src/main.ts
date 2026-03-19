import { loadSpec } from "./core/loader";
import type { BridgeSpec } from "./core/types";
import type { Rect, TreemapNode } from "./layout/treemap";
import { computeLayout, renderColonyMap, hitTest } from "./canvas";

interface State {
  ctx: CanvasRenderingContext2D;
  spec: BridgeSpec;
  nodes: TreemapNode[];
  viewport: Rect;
  hoveredId: string | null;
  dpr: number;
}

function getViewport(): Rect {
  return { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

function setupCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; dpr: number } {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.scale(dpr, dpr);

  return { ctx, dpr };
}

function resizeCanvas(canvas: HTMLCanvasElement, state: State) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  state.ctx.setTransform(1, 0, 0, 1, 0, 0);
  state.ctx.scale(dpr, dpr);
  state.dpr = dpr;
  state.viewport = getViewport();
  state.nodes = computeLayout(state.spec, state.viewport);
}

function startRenderLoop(state: State) {
  function frame(time: number) {
    renderColonyMap(state.ctx, state.spec, state.nodes, state.viewport, state.hoveredId, time);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

async function main() {
  const canvas = document.getElementById("colony") as HTMLCanvasElement;
  if (!canvas) throw new Error("Canvas element not found");

  const { ctx, dpr } = setupCanvas(canvas);
  const spec = await loadSpec();
  const viewport = getViewport();
  const nodes = computeLayout(spec, viewport);

  const state: State = { ctx, spec, nodes, viewport, hoveredId: null, dpr };

  canvas.addEventListener("mousemove", (e) => {
    state.hoveredId = hitTest(state.nodes, e.clientX, e.clientY);
    canvas.style.cursor = state.hoveredId ? "pointer" : "default";
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoveredId = null;
    canvas.style.cursor = "default";
  });

  window.addEventListener("resize", () => resizeCanvas(canvas, state));

  startRenderLoop(state);
}

main();
