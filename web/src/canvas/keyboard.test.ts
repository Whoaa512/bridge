import { test, expect, describe } from "bun:test";
import { keyToDirection, panCamera } from "./keyboard";
import type { Camera } from "./camera";

describe("keyToDirection", () => {
  test("WASD keys", () => {
    expect(keyToDirection("w")).toBe("up");
    expect(keyToDirection("a")).toBe("left");
    expect(keyToDirection("s")).toBe("down");
    expect(keyToDirection("d")).toBe("right");
  });

  test("arrow keys", () => {
    expect(keyToDirection("ArrowUp")).toBe("up");
    expect(keyToDirection("ArrowLeft")).toBe("left");
    expect(keyToDirection("ArrowDown")).toBe("down");
    expect(keyToDirection("ArrowRight")).toBe("right");
  });

  test("vim keys", () => {
    expect(keyToDirection("h")).toBe("left");
    expect(keyToDirection("j")).toBe("down");
    expect(keyToDirection("k")).toBe("up");
    expect(keyToDirection("l")).toBe("right");
  });

  test("unmapped keys return null", () => {
    expect(keyToDirection("x")).toBeNull();
    expect(keyToDirection("Enter")).toBeNull();
    expect(keyToDirection("Escape")).toBeNull();
  });
});

describe("panCamera", () => {
  const cam: Camera = { x: 100, y: 200, zoom: 1 };

  test("pans left", () => {
    const result = panCamera(cam, "left");
    expect(result.x).toBe(-50);
    expect(result.y).toBe(200);
    expect(result.zoom).toBe(1);
  });

  test("pans right", () => {
    const result = panCamera(cam, "right");
    expect(result.x).toBe(250);
    expect(result.y).toBe(200);
  });

  test("pans up", () => {
    const result = panCamera(cam, "up");
    expect(result.x).toBe(100);
    expect(result.y).toBe(50);
  });

  test("pans down", () => {
    const result = panCamera(cam, "down");
    expect(result.x).toBe(100);
    expect(result.y).toBe(350);
  });

  test("pan amount scales inversely with zoom", () => {
    const zoomed: Camera = { x: 100, y: 200, zoom: 2 };
    const result = panCamera(zoomed, "right");
    expect(result.x).toBe(175);
  });

  test("does not mutate original camera", () => {
    const original = { x: 100, y: 200, zoom: 1 };
    panCamera(original, "left");
    expect(original.x).toBe(100);
    expect(original.y).toBe(200);
  });
});
