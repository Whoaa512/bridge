import { describe, test, expect, beforeEach, mock } from "bun:test";
import type { BridgeSpec } from "../core/types";

const fetchMock = mock(() => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(makeSpec([])),
}));

const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) { return this.store[key] ?? null; },
  setItem(key: string, val: string) { this.store[key] = val; },
  removeItem(key: string) { delete this.store[key]; },
  clear() { this.store = {}; },
};

const windowListeners = new Map<string, Set<Function>>();

function mockWindow() {
  windowListeners.clear();
  (globalThis as any).window = globalThis;
  (globalThis as any).innerWidth = 800;
  (globalThis as any).innerHeight = 600;
  (globalThis as any).devicePixelRatio = 1;
  (globalThis as any).fetch = fetchMock;
  (globalThis as any).localStorage = localStorageMock;
  (globalThis as any).requestAnimationFrame = mock((cb: any) => {
    setTimeout(() => cb(0), 0);
    return 1;
  });

  (globalThis as any).addEventListener = mock((type: string, fn: Function) => {
    const set = windowListeners.get(type) ?? new Set();
    set.add(fn);
    windowListeners.set(type, set);
  });
  (globalThis as any).removeEventListener = mock((type: string, fn: Function) => {
    windowListeners.get(type)?.delete(fn);
  });

  (globalThis as any).document = {
    getElementById: mock((id: string) => {
      if (id === "ui-root") {
        return { appendChild: () => {}, querySelector: () => null };
      }
      return null;
    }),
    createElement: mock(() => ({
      id: "",
      style: { cssText: "" },
      textContent: "",
      className: "",
      innerHTML: "",
      appendChild: () => {},
      remove: () => {},
    })),
    head: { appendChild: () => {} },
  };
}

beforeEach(() => {
  localStorageMock.clear();
  fetchMock.mockClear();
  mockWindow();
});

function makeSpec(projects: BridgeSpec["projects"]): BridgeSpec {
  return {
    version: "1.0",
    scannedAt: new Date().toISOString(),
    machine: { hostname: "test", os: "test", uptime: 0 },
    projects,
    infrastructure: { ports: [], docker: [], resources: { cpuByProject: {}, memByProject: {} } },
    alerts: [],
    cycle: {
      period: "weekly",
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      summary: { commitsTotal: 0, projectsActive: 0, prsOpened: 0, prsMerged: 0, alertsNew: 0, alertsResolved: 0 },
    },
  };
}

function makeProject(id: string): BridgeSpec["projects"][0] {
  return {
    id,
    path: `/code/${id}`,
    name: id,
    kind: "git_repo",
    classification: "personal",
    classificationSource: "auto",
    languages: [],
    git: null,
    ci: null,
    prs: [],
    tasks: [],
    size: null,
    activity: null,
    subprojects: [],
    priority: null,
    flags: [],
    errors: [],
  };
}

function makeCanvas(): HTMLCanvasElement {
  const listeners = new Map<string, Set<Function>>();
  return {
    getContext: () => ({
      scale: () => {},
      clearRect: () => {},
      fillRect: () => {},
      fillText: () => {},
      measureText: () => ({ width: 0 }),
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      arcTo: () => {},
      closePath: () => {},
      fill: () => {},
      stroke: () => {},
      setTransform: () => {},
      globalAlpha: 1,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textBaseline: "",
    }),
    width: 800,
    height: 600,
    style: { width: "800px", height: "600px", display: "block", cursor: "default" },
    addEventListener: mock((_type: string, _fn: Function, _opts?: any) => {
      const set = listeners.get(_type) ?? new Set();
      set.add(_fn);
      listeners.set(_type, set);
    }),
    removeEventListener: mock((_type: string, _fn: Function) => {
      listeners.get(_type)?.delete(_fn);
    }),
  } as unknown as HTMLCanvasElement;
}

describe("initCanvas", () => {
  test("returns a CanvasHandle with correct methods", async () => {
    const { initCanvas } = await import("./bridge");
    const canvas = makeCanvas();
    const handle = initCanvas(canvas);

    expect(handle).toBeDefined();
    expect(typeof handle.destroy).toBe("function");
    expect(typeof handle.setVisible).toBe("function");
    expect(typeof handle.updateSpec).toBe("function");

    handle.destroy();
  });

  test("setVisible hides and shows canvas", async () => {
    const { initCanvas } = await import("./bridge");
    const canvas = makeCanvas();
    const handle = initCanvas(canvas);

    handle.setVisible(false);
    expect(canvas.style.display).toBe("none");

    handle.setVisible(true);
    expect(canvas.style.display).toBe("block");

    handle.destroy();
  });

  test("updateSpec does not throw on valid spec", async () => {
    const { initCanvas } = await import("./bridge");
    const canvas = makeCanvas();
    const handle = initCanvas(canvas);

    await new Promise((r) => setTimeout(r, 50));

    const spec = makeSpec([makeProject("test-proj")]);
    expect(() => handle.updateSpec(spec)).not.toThrow();

    handle.destroy();
  });

  test("updateSpec after destroy is a no-op", async () => {
    const { initCanvas } = await import("./bridge");
    const canvas = makeCanvas();
    const handle = initCanvas(canvas);

    handle.destroy();

    const spec = makeSpec([makeProject("test-proj")]);
    expect(() => handle.updateSpec(spec)).not.toThrow();
  });

  test("destroy is idempotent", async () => {
    const { initCanvas } = await import("./bridge");
    const canvas = makeCanvas();
    const handle = initCanvas(canvas);

    expect(() => {
      handle.destroy();
      handle.destroy();
    }).not.toThrow();
  });
});
