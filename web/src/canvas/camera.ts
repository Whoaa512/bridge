import type { Rect } from "../layout/treemap";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5.0;
const DEFAULT_PADDING = 40;

function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

export function screenToWorld(camera: Camera, sx: number, sy: number): { x: number; y: number } {
  return {
    x: sx / camera.zoom + camera.x,
    y: sy / camera.zoom + camera.y,
  };
}

export function worldToScreen(camera: Camera, wx: number, wy: number): { x: number; y: number } {
  return {
    x: (wx - camera.x) * camera.zoom,
    y: (wy - camera.y) * camera.zoom,
  };
}

export function applyCamera(ctx: CanvasRenderingContext2D, camera: Camera): void {
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
}

export function resetCamera(ctx: CanvasRenderingContext2D, dpr: number): void {
  ctx.restore();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function lerpCamera(current: Camera, target: Camera, t: number): Camera {
  return {
    x: current.x + (target.x - current.x) * t,
    y: current.y + (target.y - current.y) * t,
    zoom: current.zoom + (target.zoom - current.zoom) * t,
  };
}

export function cameraForRect(rect: Rect, viewport: Rect, padding = DEFAULT_PADDING): Camera {
  const padW = viewport.w - padding * 2;
  const padH = viewport.h - padding * 2;
  if (padW <= 0 || padH <= 0 || rect.w <= 0 || rect.h <= 0) {
    return DEFAULT_CAMERA;
  }

  const zoom = clampZoom(Math.min(padW / rect.w, padH / rect.h));

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  return {
    x: cx - viewport.w / (2 * zoom),
    y: cy - viewport.h / (2 * zoom),
    zoom,
  };
}

export function cameraToFit(contentBounds: Rect, viewport: Rect, padding = DEFAULT_PADDING): Camera {
  return cameraForRect(contentBounds, viewport, padding);
}

export function camerasEqual(a: Camera, b: Camera, epsilon = 0.01): boolean {
  return (
    Math.abs(a.x - b.x) < epsilon &&
    Math.abs(a.y - b.y) < epsilon &&
    Math.abs(a.zoom - b.zoom) < epsilon
  );
}

export function zoomAtPoint(
  camera: Camera,
  screenX: number,
  screenY: number,
  zoomFactor: number,
): Camera {
  const newZoom = clampZoom(camera.zoom * zoomFactor);

  const worldBefore = screenToWorld(camera, screenX, screenY);
  const newX = worldBefore.x - screenX / newZoom;
  const newY = worldBefore.y - screenY / newZoom;

  return { x: newX, y: newY, zoom: newZoom };
}

export function contentBounds(rects: Rect[]): Rect {
  if (rects.length === 0) return { x: 0, y: 0, w: 0, h: 0 };

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const r of rects) {
    if (r.x < minX) minX = r.x;
    if (r.y < minY) minY = r.y;
    if (r.x + r.w > maxX) maxX = r.x + r.w;
    if (r.y + r.h > maxY) maxY = r.y + r.h;
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
