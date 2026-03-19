import type { Classification, Project } from "../core/types";
import type { Rect, TreemapNode, TreemapGroup } from "../layout/treemap";
import { groupedTreemap } from "../layout/treemap";
import { computeWeight } from "../layout/weight";
import { COLORS, classificationColor, activityGlow } from "./colors";
import { renderGroupLabel } from "./groups";
import type { Camera } from "./camera";
import { applyCamera, resetCamera, DEFAULT_CAMERA } from "./camera";

const TILE_GAP = 4;
const CORNER_RADIUS = 4;
const TILE_ALPHA = 0.85;

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && ctx.measureText(truncated + "…").width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + "…";
}

function insetRect(r: Rect, gap: number): Rect {
  return {
    x: r.x + gap,
    y: r.y + gap,
    w: Math.max(0, r.w - gap * 2),
    h: Math.max(0, r.h - gap * 2),
  };
}

function renderTile(
  ctx: CanvasRenderingContext2D,
  node: TreemapNode,
  project: Project,
  isHovered: boolean,
  time: number,
) {
  const r = insetRect(node.rect, TILE_GAP / 2);
  if (r.w <= 0 || r.h <= 0) return;

  const staleDays = project.activity?.staleDays ?? 999;
  const isActive = staleDays < 7;

  ctx.save();

  const baseColor = classificationColor(project.classification);
  ctx.globalAlpha = TILE_ALPHA;
  ctx.fillStyle = baseColor;
  roundRect(ctx, r.x, r.y, r.w, r.h, CORNER_RADIUS);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (isActive) {
    const pulse = 0.15 + 0.1 * Math.sin(time * 0.003);
    ctx.fillStyle = activityGlow(staleDays);
    ctx.globalAlpha = pulse;
    roundRect(ctx, r.x, r.y, r.w, r.h, CORNER_RADIUS);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = isHovered ? COLORS.tileBorderHovered : COLORS.tileBorder;
  ctx.lineWidth = isHovered ? 2 : 1;
  roundRect(ctx, r.x, r.y, r.w, r.h, CORNER_RADIUS);
  ctx.stroke();

  const padX = 8;
  const padY = 8;
  const textMaxW = r.w - padX * 2;
  if (textMaxW <= 10) {
    ctx.restore();
    return;
  }

  ctx.font = "bold 13px Inter, system-ui, sans-serif";
  ctx.fillStyle = COLORS.text;
  const name = truncateText(ctx, project.name, textMaxW);
  ctx.fillText(name, r.x + padX, r.y + padY + 13);

  if (r.h > 50 && r.w > 60) {
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.fillStyle = COLORS.textSecondary;
    let infoY = r.y + padY + 30;

    if (project.git) {
      const branch = truncateText(ctx, project.git.branch, textMaxW);
      ctx.fillText(branch, r.x + padX, infoY);
      infoY += 16;

      if (project.git.uncommitted > 0 && r.h > 70) {
        const uncommitted = `${project.git.uncommitted} uncommitted`;
        ctx.fillText(uncommitted, r.x + padX, infoY);
      }
    }
  }

  ctx.restore();
}

export interface ColonyLayout {
  groups: TreemapGroup[];
  nodes: TreemapNode[];
  classificationByGroup: Map<string, Classification>;
}

const CLASSIFICATION_ORDER: Classification[] = ["public", "internal", "personal"];
const CLASSIFICATION_LABELS: Record<Classification, string> = {
  public: "Public",
  internal: "Internal",
  personal: "Personal",
};

export function computeLayout(projects: Project[], viewport: Rect): ColonyLayout {
  const margin = 20;
  const bounds: Rect = {
    x: viewport.x + margin,
    y: viewport.y + margin,
    w: Math.max(0, viewport.w - margin * 2),
    h: Math.max(0, viewport.h - margin * 2),
  };

  const byClass = new Map<Classification, Project[]>();
  for (const p of projects) {
    const list = byClass.get(p.classification) ?? [];
    list.push(p);
    byClass.set(p.classification, list);
  }

  const groupInputs = CLASSIFICATION_ORDER
    .filter((c) => byClass.has(c))
    .map((c) => ({
      id: c,
      label: CLASSIFICATION_LABELS[c],
      items: byClass.get(c)!.map((p) => ({ id: p.id, weight: computeWeight(p) })),
    }));

  const groups = groupedTreemap(groupInputs, bounds);
  const nodes = groups.flatMap((g) => g.nodes);
  const classificationByGroup = new Map<string, Classification>(
    groups.map((g) => [g.id, g.id as Classification]),
  );

  return { groups, nodes, classificationByGroup };
}

export function renderColonyMap(
  ctx: CanvasRenderingContext2D,
  projectMap: Map<string, Project>,
  layout: ColonyLayout,
  viewport: Rect,
  hoveredId: string | null,
  time: number,
  camera: Camera = DEFAULT_CAMERA,
  dpr = 1,
): void {
  ctx.clearRect(viewport.x, viewport.y, viewport.w, viewport.h);
  ctx.fillStyle = COLORS.background;
  ctx.fillRect(viewport.x, viewport.y, viewport.w, viewport.h);

  applyCamera(ctx, camera);

  for (const group of layout.groups) {
    const classification = layout.classificationByGroup.get(group.id);
    if (classification) {
      renderGroupLabel(ctx, group, classification);
    }
  }

  for (const node of layout.nodes) {
    const project = projectMap.get(node.id);
    if (!project) continue;
    renderTile(ctx, node, project, node.id === hoveredId, time);
  }

  resetCamera(ctx, dpr);
}

export function buildProjectMap(projects: Project[]): Map<string, Project> {
  return new Map(projects.map((p) => [p.id, p]));
}

export function hasActiveProjects(projects: Project[]): boolean {
  return projects.some((p) => (p.activity?.staleDays ?? 999) < 7);
}
