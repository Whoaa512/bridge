import { loadSpec } from "./core/loader";
import { connectWS } from "./core/ws";
import { filterProjects, DEFAULT_FILTER } from "./core/filter";
import type { BridgeSpec, Project } from "./core/types";
import type { Rect, TreemapNode } from "./layout/treemap";
import {
  computeLayout,
  renderColonyMap,
  buildProjectMap,
  hasActiveProjects,
  hitTest,
  type Camera,
  type ColonyLayout,
  DEFAULT_CAMERA,
  lerpCamera,
  camerasEqual,
  cameraToFit,
  cameraForRect,
  zoomAtPoint,
  contentBounds,
} from "./canvas";
import { showDrawer, hideDrawer, showLoading, hideLoading, showEmpty, hideEmpty } from "./ui";

const LERP_SPEED = 0.15;
const FOCUS_ZOOM = 2.0;

interface State {
  ctx: CanvasRenderingContext2D;
  spec: BridgeSpec;
  visibleProjects: Project[];
  projectMap: Map<string, Project>;
  layout: ColonyLayout;
  viewport: Rect;
  hoveredId: string | null;
  dirty: boolean;
  animating: boolean;
  dpr: number;
  camera: Camera;
  targetCamera: Camera;
  renderLoopStarted: boolean;
}

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  startCamX: number;
  startCamY: number;
  moved: boolean;
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
  state.layout = computeLayout(state.visibleProjects, state.viewport);
  const fitCam = fitCamera(state.layout.nodes, state.viewport);
  state.targetCamera = fitCam;
  state.dirty = true;
}

function fitCamera(nodes: TreemapNode[], viewport: Rect): Camera {
  if (nodes.length === 0) return DEFAULT_CAMERA;
  const bounds = contentBounds(nodes.map((n) => n.rect));
  return cameraToFit(bounds, viewport);
}

function nodeRect(nodes: TreemapNode[], id: string): Rect | null {
  const node = nodes.find((n) => n.id === id);
  return node ? node.rect : null;
}

function startRenderLoop(state: State) {
  if (state.renderLoopStarted) return;
  state.renderLoopStarted = true;

  function frame(time: number) {
    if (!camerasEqual(state.camera, state.targetCamera)) {
      state.camera = lerpCamera(state.camera, state.targetCamera, LERP_SPEED);
      if (camerasEqual(state.camera, state.targetCamera)) {
        state.camera = { ...state.targetCamera };
      }
      state.dirty = true;
    }

    if (state.dirty || state.animating) {
      renderColonyMap(
        state.ctx,
        state.projectMap,
        state.layout,
        state.viewport,
        state.hoveredId,
        time,
        state.camera,
        state.dpr,
      );
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

function initStateFromSpec(state: State, spec: BridgeSpec) {
  state.spec = spec;
  state.visibleProjects = filterProjects(spec.projects, DEFAULT_FILTER);
  state.projectMap = buildProjectMap(state.visibleProjects);
  state.layout = computeLayout(state.visibleProjects, state.viewport);
  state.animating = hasActiveProjects(state.visibleProjects);
  const cam = fitCamera(state.layout.nodes, state.viewport);
  state.camera = cam;
  state.targetCamera = cam;
  state.dirty = true;
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

  const viewport = getViewport();
  const visibleProjects = filterProjects(spec.projects, DEFAULT_FILTER);
  const layout = computeLayout(visibleProjects, viewport);
  const projectMap = buildProjectMap(visibleProjects);
  const animating = hasActiveProjects(visibleProjects);
  const initialCamera = fitCamera(layout.nodes, viewport);

  const state: State = {
    ctx,
    spec,
    visibleProjects,
    projectMap,
    layout,
    viewport,
    hoveredId: null,
    dirty: true,
    animating,
    dpr,
    camera: initialCamera,
    targetCamera: initialCamera,
    renderLoopStarted: false,
  };

  const drag: DragState = {
    active: false,
    startX: 0,
    startY: 0,
    startCamX: 0,
    startCamY: 0,
    moved: false,
  };

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    state.targetCamera = zoomAtPoint(state.targetCamera, e.clientX, e.clientY, factor);
  }, { passive: false });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    drag.active = true;
    drag.moved = false;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.startCamX = state.targetCamera.x;
    drag.startCamY = state.targetCamera.y;
  });

  window.addEventListener("mousemove", (e) => {
    if (drag.active) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;

      if (drag.moved) {
        state.targetCamera = {
          ...state.targetCamera,
          x: drag.startCamX - dx / state.targetCamera.zoom,
          y: drag.startCamY - dy / state.targetCamera.zoom,
        };
        canvas.style.cursor = "grabbing";
      }
      return;
    }

    const prev = state.hoveredId;
    state.hoveredId = hitTest(state.layout.nodes, e.clientX, e.clientY, state.camera);
    if (state.hoveredId !== prev) state.dirty = true;
    canvas.style.cursor = state.hoveredId ? "pointer" : "default";
  });

  window.addEventListener("mouseup", () => {
    if (drag.active) {
      drag.active = false;
      if (!drag.moved) return;
      canvas.style.cursor = state.hoveredId ? "pointer" : "default";
    }
  });

  canvas.addEventListener("mouseleave", () => {
    if (state.hoveredId !== null) state.dirty = true;
    state.hoveredId = null;
    if (!drag.active) canvas.style.cursor = "default";
  });

  canvas.addEventListener("click", (e) => {
    if (drag.moved) return;
    const id = hitTest(state.layout.nodes, e.clientX, e.clientY, state.camera);
    if (!id) {
      hideDrawer();
      return;
    }
    const project = findProject(state.spec, id);
    if (!project) return;
    showDrawer(project);
  });

  canvas.addEventListener("dblclick", (e) => {
    const id = hitTest(state.layout.nodes, e.clientX, e.clientY, state.camera);
    if (!id) {
      state.targetCamera = fitCamera(state.layout.nodes, state.viewport);
      return;
    }
    const rect = nodeRect(state.layout.nodes, id);
    if (!rect) return;
    const focused = cameraForRect(rect, state.viewport);
    state.targetCamera = {
      ...focused,
      zoom: Math.max(focused.zoom, FOCUS_ZOOM),
    };
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideDrawer();
  });

  window.addEventListener("resize", () => resizeCanvas(canvas, state));

  const hasProjects = spec.projects.length > 0;

  if (!hasProjects) {
    showEmpty();
  }

  connectWS({
    onSpec: (newSpec) => {
      if (!state.renderLoopStarted && newSpec.projects.length > 0) {
        hideEmpty();
        initStateFromSpec(state, newSpec);
        startRenderLoop(state);
        return;
      }

      state.spec = newSpec;
      state.visibleProjects = filterProjects(newSpec.projects, DEFAULT_FILTER);
      state.projectMap = buildProjectMap(state.visibleProjects);
      state.layout = computeLayout(state.visibleProjects, state.viewport);
      state.dirty = true;
      state.animating = hasActiveProjects(state.visibleProjects);
    },
    onDisconnect: () => console.log("[bridge] ws disconnected"),
    onReconnect: () => console.log("[bridge] ws reconnected"),
  });

  if (hasProjects) {
    startRenderLoop(state);
  }
}

main().catch((err) => {
  hideLoading();
  console.error("Bridge init failed:", err);
});
