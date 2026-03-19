import { test, expect, describe } from "bun:test";
import { hitTest } from "./hit";
import type { TreemapNode } from "../layout/treemap";

const nodes: TreemapNode[] = [
  { id: "a", weight: 50, rect: { x: 0, y: 0, w: 500, h: 600 } },
  { id: "b", weight: 30, rect: { x: 500, y: 0, w: 500, h: 360 } },
  { id: "c", weight: 20, rect: { x: 500, y: 360, w: 500, h: 240 } },
];

describe("hitTest", () => {
  test("hit on known tile returns correct id", () => {
    expect(hitTest(nodes, 250, 300)).toBe("a");
    expect(hitTest(nodes, 750, 100)).toBe("b");
    expect(hitTest(nodes, 750, 500)).toBe("c");
  });

  test("miss outside all tiles returns null", () => {
    expect(hitTest(nodes, -10, 300)).toBeNull();
    expect(hitTest(nodes, 1100, 300)).toBeNull();
    expect(hitTest(nodes, 500, -5)).toBeNull();
    expect(hitTest(nodes, 500, 700)).toBeNull();
  });

  test("click on shared border — last painted wins (iterate backwards)", () => {
    const result = hitTest(nodes, 500, 360);
    expect(result).toBe("c");
  });

  test("empty nodes returns null", () => {
    expect(hitTest([], 100, 100)).toBeNull();
  });

  test("click on exact corner of first tile", () => {
    expect(hitTest(nodes, 0, 0)).toBe("a");
  });

  test("click on exact bottom-right of last tile", () => {
    expect(hitTest(nodes, 1000, 600)).toBe("c");
  });
});
