import type { Classification } from "../core/types";
import type { TreemapGroup } from "../layout/treemap";
import { classificationColor } from "./colors";

const HEADER_HEIGHT = 24;

export function renderGroupLabel(
  ctx: CanvasRenderingContext2D,
  group: TreemapGroup,
  classification: Classification,
): void {
  const { x, y, w } = group.rect;
  if (w < 40) return;

  const color = classificationColor(classification);

  ctx.save();

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.1;
  ctx.fillRect(x, y, w, HEADER_HEIGHT);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + HEADER_HEIGHT);
  ctx.lineTo(x + w, y + HEADER_HEIGHT);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.font = "bold 11px Inter, system-ui, sans-serif";
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  const label = `${group.label.toUpperCase()} (${group.nodes.length})`;
  ctx.fillText(label, x + 8, y + HEADER_HEIGHT / 2);

  ctx.restore();
}

export { HEADER_HEIGHT as GROUP_HEADER_HEIGHT };
