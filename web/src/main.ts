import { loadSpec } from "./core/loader";
import { connectWS } from "./core/ws";
import type { BridgeSpec, Project } from "./core/types";
import type { Rect, TreemapNode } from "./layout/treemap";
import { computeLayout, renderColonyMap, buildProjectMap, hasActiveProjects, hitTest } from "./canvas";
import { showDrawer, hideDrawer, showLoading, hideLoading, showEmpty } from "./ui";

interface State {
  ctx: CanvasRenderingContext2D;
  spec: BridgeSpec;
  projectMap: Map<string, Project>;
  nodes: TreemapNode[];
  viewport: Rect;
  hoveredId: string | null;
  dirty: boolean;
  animating: boolean;
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
  state.dirty = true;
}

function startRenderLoop(state: State) {
  function frame(time: number) {
    if (state.dirty || state.animating) {
      renderColonyMap(state.ctx, state.projectMap, state.nodes, state.viewport, state.hoveredId, time);
      state.dirty = false;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function findProject(spec: BridgeSpec, id: string): Project | undefined {
  return spec.projects.find((p) => p.id === id);
}

function showError(message: string) {
  const root = document.getElementById("ui-root");
  if (!root) return;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#f85149;font-size:16px;font-family:system-ui;text-align:center;max-width:400px;";
  div.textContent = message;
  root.appendChild(div);
}

async function main() {
  const canvas = document.getElementById("colony") as HTMLCanvasElement;
  if (!canvas) throw new Error("Canvas element not found");

  const { ctx, dpr } = setupCanvas(canvas);

  showLoading();

  let spec: BridgeSpec;
  try {
    spec = await loadSpec();
  } catch (err) {
    hideLoading();
    showError(`Failed to connect to Bridge scanner. Is \`bridge serve\` running?\n\n${err}`);
    return;
  }
  hideLoading();

  if (spec.projects.length === 0) {
    showEmpty();
    return;
  }

  const viewport = getViewport();
  const nodes = computeLayout(spec, viewport);
  const projectMap = buildProjectMap(spec);
  const animating = hasActiveProjects(spec);

  const state: State = { ctx, spec, projectMap, nodes, viewport, hoveredId: null, dirty: true, animating, dpr };

  canvas.addEventListener("mousemove", (e) => {
    const prev = state.hoveredId;
    state.hoveredId = hitTest(state.nodes, e.clientX, e.clientY);
    if (state.hoveredId !== prev) state.dirty = true;
    canvas.style.cursor = state.hoveredId ? "pointer" : "default";
  });

  canvas.addEventListener("mouseleave", () => {
    if (state.hoveredId !== null) state.dirty = true;
    state.hoveredId = null;
    canvas.style.cursor = "default";
  });

  canvas.addEventListener("click", (e) => {
    const id = hitTest(state.nodes, e.clientX, e.clientY);
    if (!id) {
      hideDrawer();
      return;
    }
    const project = findProject(state.spec, id);
    if (!project) return;
    showDrawer(project);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideDrawer();
  });

  window.addEventListener("resize", () => resizeCanvas(canvas, state));

  connectWS({
    onSpec: (spec) => {
      state.spec = spec;
      state.projectMap = buildProjectMap(spec);
      state.nodes = computeLayout(spec, state.viewport);
      state.dirty = true;
      state.animating = hasActiveProjects(spec);
    },
    onDisconnect: () => console.log("[bridge] ws disconnected"),
    onReconnect: () => console.log("[bridge] ws reconnected"),
  });

  startRenderLoop(state);
}

main().catch((err) => {
  hideLoading();
  console.error("Bridge init failed:", err);
});
