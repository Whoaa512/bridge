import type { TreemapNode } from "../layout/treemap";
import type { Camera } from "./camera";
import { screenToWorld, DEFAULT_CAMERA } from "./camera";

export function hitTest(
  nodes: TreemapNode[],
  screenX: number,
  screenY: number,
  camera: Camera = DEFAULT_CAMERA,
): string | null {
  const { x, y } = screenToWorld(camera, screenX, screenY);

  for (let i = nodes.length - 1; i >= 0; i--) {
    const r = nodes[i].rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return nodes[i].id;
    }
  }
  return null;
}
