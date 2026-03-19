import type { TreemapNode } from "../layout/treemap";

export function hitTest(nodes: TreemapNode[], x: number, y: number): string | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const r = nodes[i].rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
      return nodes[i].id;
    }
  }
  return null;
}
