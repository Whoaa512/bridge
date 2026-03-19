import { test, expect, describe } from "bun:test";
import { treemap, type TreemapInput, type Rect } from "./treemap";

const bounds: Rect = { x: 0, y: 0, w: 1000, h: 600 };

describe("treemap", () => {
  test("empty input → empty output", () => {
    expect(treemap([], bounds)).toEqual([]);
  });

  test("single item fills entire rect", () => {
    const items: TreemapInput[] = [{ id: "a", weight: 50 }];
    const nodes = treemap(items, bounds);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].id).toBe("a");
    expect(nodes[0].rect.x).toBe(bounds.x);
    expect(nodes[0].rect.y).toBe(bounds.y);
    expect(nodes[0].rect.w).toBe(bounds.w);
    expect(nodes[0].rect.h).toBe(bounds.h);
  });

  test("2 equal-weight items each get ~half the area", () => {
    const items: TreemapInput[] = [
      { id: "a", weight: 100 },
      { id: "b", weight: 100 },
    ];
    const nodes = treemap(items, bounds);
    expect(nodes).toHaveLength(2);

    const totalArea = bounds.w * bounds.h;
    for (const node of nodes) {
      const area = node.rect.w * node.rect.h;
      expect(area).toBeCloseTo(totalArea / 2, -1);
    }
  });

  test("3 items — areas proportional to weights", () => {
    const items: TreemapInput[] = [
      { id: "big", weight: 60 },
      { id: "med", weight: 30 },
      { id: "small", weight: 10 },
    ];
    const nodes = treemap(items, bounds);
    expect(nodes).toHaveLength(3);

    const totalArea = bounds.w * bounds.h;
    const totalWeight = 100;
    for (const node of nodes) {
      const expectedFraction = node.weight / totalWeight;
      const actualFraction = (node.rect.w * node.rect.h) / totalArea;
      expect(actualFraction).toBeCloseTo(expectedFraction, 1);
    }
  });

  test("tiles fill bounds exactly (sum of areas ≈ bounds area)", () => {
    const items: TreemapInput[] = [
      { id: "a", weight: 40 },
      { id: "b", weight: 30 },
      { id: "c", weight: 20 },
      { id: "d", weight: 10 },
    ];
    const nodes = treemap(items, bounds);
    const totalArea = bounds.w * bounds.h;
    const sumAreas = nodes.reduce((s, n) => s + n.rect.w * n.rect.h, 0);
    expect(sumAreas).toBeCloseTo(totalArea, 0);
  });

  test("no tiles overlap (5 items)", () => {
    const items: TreemapInput[] = Array.from({ length: 5 }, (_, i) => ({
      id: `p${i}`,
      weight: (i + 1) * 10,
    }));
    const nodes = treemap(items, bounds);

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i].rect;
        const b = nodes[j].rect;
        const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
        const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
        if (overlapX && overlapY) {
          const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(ox * oy).toBeLessThan(0.01);
        }
      }
    }
  });

  test("deterministic — same input produces same output", () => {
    const items: TreemapInput[] = [
      { id: "x", weight: 50 },
      { id: "y", weight: 30 },
      { id: "z", weight: 20 },
    ];
    const run1 = treemap(items, bounds);
    const run2 = treemap(items, bounds);
    expect(run1).toEqual(run2);
  });

  test("zero total weight → empty output", () => {
    const items: TreemapInput[] = [{ id: "a", weight: 0 }];
    expect(treemap(items, bounds)).toEqual([]);
  });
});
