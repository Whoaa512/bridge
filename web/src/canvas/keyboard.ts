import type { Camera } from "./camera";

const PAN_SPEED = 150;

type Direction = "left" | "right" | "up" | "down";

const KEY_MAP: Record<string, Direction> = {
  w: "up",
  a: "left",
  s: "down",
  d: "right",

  ArrowUp: "up",
  ArrowLeft: "left",
  ArrowDown: "down",
  ArrowRight: "right",

  h: "left",
  j: "down",
  k: "up",
  l: "right",
};

export function keyToDirection(key: string): Direction | null {
  return KEY_MAP[key] ?? null;
}

export function panCamera(camera: Camera, direction: Direction): Camera {
  const amount = PAN_SPEED / camera.zoom;
  switch (direction) {
    case "left":
      return { ...camera, x: camera.x - amount };
    case "right":
      return { ...camera, x: camera.x + amount };
    case "up":
      return { ...camera, y: camera.y - amount };
    case "down":
      return { ...camera, y: camera.y + amount };
  }
}
