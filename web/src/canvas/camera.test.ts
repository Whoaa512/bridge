import { test, expect, describe } from "bun:test";
import {
  screenToWorld,
  worldToScreen,
  cameraForRect,
  cameraToFit,
  lerpCamera,
  zoomAtPoint,
  camerasEqual,
  contentBounds,
  DEFAULT_CAMERA,
} from "./camera";
import type { Camera } from "./camera";

describe("screenToWorld / worldToScreen roundtrip", () => {
  test("identity camera is passthrough", () => {
    const w = screenToWorld(DEFAULT_CAMERA, 100, 200);
    expect(w.x).toBe(100);
    expect(w.y).toBe(200);
  });

  test("roundtrip with offset and zoom", () => {
    const cam: Camera = { x: 50, y: 100, zoom: 2 };
    const world = screenToWorld(cam, 300, 400);
    const screen = worldToScreen(cam, world.x, world.y);
    expect(screen.x).toBeCloseTo(300, 5);
    expect(screen.y).toBeCloseTo(400, 5);
  });

  test("roundtrip at fractional zoom", () => {
    const cam: Camera = { x: -20, y: 30, zoom: 0.5 };
    const world = screenToWorld(cam, 150, 75);
    const screen = worldToScreen(cam, world.x, world.y);
    expect(screen.x).toBeCloseTo(150, 5);
    expect(screen.y).toBeCloseTo(75, 5);
  });
});

describe("lerpCamera", () => {
  const a: Camera = { x: 0, y: 0, zoom: 1 };
  const b: Camera = { x: 100, y: 200, zoom: 3 };

  test("t=0 returns current", () => {
    const result = lerpCamera(a, b, 0);
    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.zoom).toBe(1);
  });

  test("t=1 returns target", () => {
    const result = lerpCamera(a, b, 1);
    expect(result.x).toBe(100);
    expect(result.y).toBe(200);
    expect(result.zoom).toBe(3);
  });

  test("t=0.5 returns midpoint", () => {
    const result = lerpCamera(a, b, 0.5);
    expect(result.x).toBe(50);
    expect(result.y).toBe(100);
    expect(result.zoom).toBe(2);
  });
});

describe("cameraForRect", () => {
  const viewport = { x: 0, y: 0, w: 1000, h: 800 };

  test("centers on given rect", () => {
    const rect = { x: 200, y: 300, w: 100, h: 100 };
    const cam = cameraForRect(rect, viewport, 0);
    const center = screenToWorld(cam, 500, 400);
    expect(center.x).toBeCloseTo(250, 0);
    expect(center.y).toBeCloseTo(350, 0);
  });

  test("zoom fits rect within viewport", () => {
    const rect = { x: 0, y: 0, w: 2000, h: 1600 };
    const cam = cameraForRect(rect, viewport, 0);
    expect(cam.zoom).toBeCloseTo(0.5, 5);
  });

  test("respects padding", () => {
    const rect = { x: 0, y: 0, w: 920, h: 720 };
    const cam = cameraForRect(rect, viewport, 40);
    expect(cam.zoom).toBeLessThanOrEqual(1.0);
  });

  test("clamps zoom to max", () => {
    const tinyRect = { x: 100, y: 100, w: 1, h: 1 };
    const cam = cameraForRect(tinyRect, viewport, 0);
    expect(cam.zoom).toBe(5.0);
  });
});

describe("cameraToFit", () => {
  test("content larger than viewport zooms out", () => {
    const content = { x: 0, y: 0, w: 3000, h: 2000 };
    const viewport = { x: 0, y: 0, w: 1000, h: 800 };
    const cam = cameraToFit(content, viewport, 0);
    expect(cam.zoom).toBeCloseTo(1000 / 3000, 5);
  });
});

describe("zoomAtPoint", () => {
  test("zoom preserves point under cursor", () => {
    const cam: Camera = { x: 0, y: 0, zoom: 1 };
    const sx = 400;
    const sy = 300;
    const worldBefore = screenToWorld(cam, sx, sy);
    const zoomed = zoomAtPoint(cam, sx, sy, 1.5);
    const worldAfter = screenToWorld(zoomed, sx, sy);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 5);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 5);
  });

  test("clamps to min zoom", () => {
    const cam: Camera = { x: 0, y: 0, zoom: 0.15 };
    const result = zoomAtPoint(cam, 0, 0, 0.5);
    expect(result.zoom).toBe(0.1);
  });

  test("clamps to max zoom", () => {
    const cam: Camera = { x: 0, y: 0, zoom: 4.8 };
    const result = zoomAtPoint(cam, 0, 0, 1.5);
    expect(result.zoom).toBe(5.0);
  });
});

describe("camerasEqual", () => {
  test("identical cameras are equal", () => {
    expect(camerasEqual({ x: 1, y: 2, zoom: 1 }, { x: 1, y: 2, zoom: 1 })).toBe(true);
  });

  test("different cameras are not equal", () => {
    expect(camerasEqual({ x: 1, y: 2, zoom: 1 }, { x: 10, y: 2, zoom: 1 })).toBe(false);
  });

  test("within epsilon is equal", () => {
    expect(camerasEqual({ x: 1, y: 2, zoom: 1 }, { x: 1.005, y: 2.005, zoom: 1.005 })).toBe(true);
  });
});

describe("contentBounds", () => {
  test("empty returns zero rect", () => {
    expect(contentBounds([])).toEqual({ x: 0, y: 0, w: 0, h: 0 });
  });

  test("computes bounding box of multiple rects", () => {
    const rects = [
      { x: 10, y: 20, w: 100, h: 50 },
      { x: 200, y: 5, w: 50, h: 300 },
    ];
    const b = contentBounds(rects);
    expect(b.x).toBe(10);
    expect(b.y).toBe(5);
    expect(b.w).toBe(240);
    expect(b.h).toBe(300);
  });
});
