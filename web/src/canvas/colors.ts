import type { Classification } from "../core/types";

export const COLORS = {
  background: "#0d1117",
  tileBorder: "#30363d",
  tileBorderHovered: "#58a6ff",
  text: "#c9d1d9",
  textSecondary: "#8b949e",
  classification: {
    public: "#2ea043",
    internal: "#58a6ff",
    personal: "#d29922",
  },
} as const;

export function classificationColor(c: Classification): string {
  return COLORS.classification[c];
}

export function activityGlow(staleDays: number): string {
  const t = Math.min(staleDays / 30, 1);
  const r = Math.round(255 * (1 - t) + 88 * t);
  const g = Math.round(140 * (1 - t) + 166 * t);
  const b = Math.round(50 * (1 - t) + 255 * t);
  const a = Math.max(0.1, 0.6 * (1 - t));
  return `rgba(${r},${g},${b},${a})`;
}
