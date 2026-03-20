import { loadSpec } from "../core/loader";
import { filterProjects, DEFAULT_FILTER } from "../core/filter";
import type { BridgeSpec, Project } from "../core/types";
import type { Rect, TreemapNode } from "../layout/treemap";
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
  keyToDirection,
  panCamera,
} from "./index";
import { showDrawer, hideDrawer, showLoading, hideLoading, updateLoading, showEmpty, hideEmpty } from "../ui";

const LERP_SPEED = 0.15;
const FOCUS_ZOOM = 2.0;

export interface CanvasHandle {
  destroy(): void;
  setVisible(visible: boolean): void;
  updateSpec(spec: BridgeSpec): void;
}

interface State {
  ctx: CanvasRenderingContext2D;
  spec: BridgeSpec | null;
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
  renderLoopRunning: boolean;
  visible: boolean;
  destroyed: boolean;
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

function fitCamera(nodes: TreemapNode[], viewport: Rect): Camera {
  if (nodes.length === 0) return DEFAULT_CAMERA;
  const bounds = contentBounds(nodes.map((n) => n.rect));
  return cameraToFit(bounds, viewport);
}

function nodeRect(nodes: TreemapNode[], id: string): Rect | null {
  const node = nodes.find((n) => n.id === id);
  return node ? node.rect : null;
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

function applySpec(state: State, spec: BridgeSpec) {
  state.spec = spec;
  state.visibleProjects = filterProjects(spec.projects, DEFAULT_FILTER);
  state.projectMap = buildProjectMap(state.visibleProjects);
  state.layout = computeLayout(state.visibleProjects, state.viewport);
  state.animating = hasActiveProjects(state.visibleProjects);
  state.dirty = true;
}

function initStateFromSpec(state: State, spec: BridgeSpec) {
  applySpec(state, spec);
  const cam = fitCamera(state.layout.nodes, state.viewport);
  state.camera = cam;
  state.targetCamera = cam;
}

function showError(message: string) {
  const root = document.getElementById("ui-root");
  if (!root) return;
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);color:#f85149;font-size:16px;font-family:system-ui;text-align:center;max-width:400px;";
  div.textContent = message;
  root.appendChild(div);
}

export function initCanvas(canvas: HTMLCanvasElement): CanvasHandle {
  const { ctx, dpr } = setupCanvas(canvas);

  const emptyLayout: ColonyLayout = { groups: [], nodes: [], classificationByGroup: new Map() };

  const state: State = {
    ctx,
    spec: null,
    visibleProjects: [],
    projectMap: new Map(),
    layout: emptyLayout,
    viewport: getViewport(),
    hoveredId: null,
    dirty: true,
    animating: false,
    dpr,
    camera: DEFAULT_CAMERA,
    targetCamera: DEFAULT_CAMERA,
    renderLoopRunning: false,
    visible: true,
    destroyed: false,
  };

  const drag: DragState = {
    active: false,
    startX: 0,
    startY: 0,
    startCamX: 0,
    startCamY: 0,
    moved: false,
  };

  const abortController = new AbortController();
  const { signal } = abortController;

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    state.targetCamera = zoomAtPoint(state.targetCamera, e.clientX, e.clientY, factor);
  }, { passive: false, signal });

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    drag.active = true;
    drag.moved = false;
    drag.startX = e.clientX;
    drag.startY = e.clientY;
    drag.startCamX = state.targetCamera.x;
    drag.startCamY = state.targetCamera.y;
  }, { signal });

  const onMouseMove = (e: MouseEvent) => {
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
  };
  window.addEventListener("mousemove", onMouseMove, { signal });

  const onMouseUp = () => {
    if (drag.active) {
      drag.active = false;
      if (!drag.moved) return;
      canvas.style.cursor = state.hoveredId ? "pointer" : "default";
    }
  };
  window.addEventListener("mouseup", onMouseUp, { signal });

  canvas.addEventListener("mouseleave", () => {
    if (state.hoveredId !== null) state.dirty = true;
    state.hoveredId = null;
    if (!drag.active) canvas.style.cursor = "default";
  }, { signal });

  canvas.addEventListener("click", (e) => {
    if (drag.moved) return;
    const id = hitTest(state.layout.nodes, e.clientX, e.clientY, state.camera);
    if (!id) {
      hideDrawer();
      return;
    }
    if (!state.spec) return;
    const project = state.spec.projects.find((p) => p.id === id);
    if (!project) return;
    showDrawer(project);
  }, { signal });

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
  }, { signal });

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      hideDrawer();
      return;
    }
    const dir = keyToDirection(e.key);
    if (dir) {
      e.preventDefault();
      state.targetCamera = panCamera(state.targetCamera, dir);
    }
  };
  window.addEventListener("keydown", onKeyDown, { signal });

  const onResize = () => resizeCanvas(canvas, state);
  window.addEventListener("resize", onResize, { signal });

  function startRenderLoop() {
    if (state.renderLoopRunning) return;
    state.renderLoopRunning = true;

    function frame(time: number) {
      if (state.destroyed) return;
      if (!state.visible) {
        state.renderLoopRunning = false;
        return;
      }

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

  showLoading();
  loadSpec((msg) => updateLoading(msg))
    .then((spec) => {
      hideLoading();
      if (state.destroyed) return;

      if (spec.projects.length === 0) {
        showEmpty();
        initStateFromSpec(state, spec);
        return;
      }

      initStateFromSpec(state, spec);
      startRenderLoop();
    })
    .catch((err) => {
      hideLoading();
      if (state.destroyed) return;
      showError(`Failed to connect to Bridge scanner. Is \`bridge serve\` running?\n\n${err}`);
    });

  return {
    destroy() {
      state.destroyed = true;
      abortController.abort();
    },

    setVisible(visible: boolean) {
      state.visible = visible;
      canvas.style.display = visible ? "block" : "none";
      if (visible && !state.renderLoopRunning && state.spec && state.spec.projects.length > 0) {
        state.dirty = true;
        startRenderLoop();
      }
    },

    updateSpec(spec: BridgeSpec) {
      if (state.destroyed) return;

      const wasEmpty = !state.spec || state.spec.projects.length === 0;
      if (wasEmpty && spec.projects.length > 0) {
        hideEmpty();
        initStateFromSpec(state, spec);
        if (state.visible) startRenderLoop();
        return;
      }

      applySpec(state, spec);
    },
  };
}
