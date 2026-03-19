export interface TreemapInput {
  id: string;
  weight: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TreemapNode {
  id: string;
  weight: number;
  rect: Rect;
}

function worstAspectRatio(row: TreemapInput[], rowArea: number, side: number): number {
  if (row.length === 0) return Infinity;

  const s2 = side * side;
  let minW = Infinity;
  let maxW = -Infinity;
  for (const item of row) {
    if (item.weight < minW) minW = item.weight;
    if (item.weight > maxW) maxW = item.weight;
  }

  const ra2 = rowArea * rowArea;
  return Math.max((s2 * maxW) / ra2, ra2 / (s2 * minW));
}

function layoutRow(
  row: TreemapInput[],
  rect: Rect,
  totalWeight: number,
  isHorizontal: boolean,
): { nodes: TreemapNode[]; remaining: Rect } {
  const rowWeight = row.reduce((sum, item) => sum + item.weight, 0);

  if (isHorizontal) {
    const rowW = (rowWeight / totalWeight) * rect.w;
    let y = rect.y;
    const nodes: TreemapNode[] = row.map((item) => {
      const h = (item.weight / rowWeight) * rect.h;
      const node: TreemapNode = { id: item.id, weight: item.weight, rect: { x: rect.x, y, w: rowW, h } };
      y += h;
      return node;
    });
    return {
      nodes,
      remaining: { x: rect.x + rowW, y: rect.y, w: rect.w - rowW, h: rect.h },
    };
  }

  const rowH = (rowWeight / totalWeight) * rect.h;
  let x = rect.x;
  const nodes: TreemapNode[] = row.map((item) => {
    const w = (item.weight / rowWeight) * rect.w;
    const node: TreemapNode = { id: item.id, weight: item.weight, rect: { x, y: rect.y, w, h: rowH } };
    x += w;
    return node;
  });
  return {
    nodes,
    remaining: { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH },
  };
}

function squarify(
  items: TreemapInput[],
  rect: Rect,
  totalWeight: number,
): TreemapNode[] {
  if (items.length === 0) return [];

  if (items.length === 1) {
    return [{ id: items[0].id, weight: items[0].weight, rect }];
  }

  const isHorizontal = rect.w >= rect.h;
  const side = isHorizontal ? rect.h : rect.w;

  const scale = (side * (isHorizontal ? rect.w : rect.h)) / totalWeight;

  const row: TreemapInput[] = [];
  let rowArea = 0;
  let best = Infinity;

  for (let i = 0; i < items.length; i++) {
    const scaledWeight = items[i].weight * scale;
    const nextRowArea = rowArea + scaledWeight;
    const nextRow = [...row, { ...items[i], weight: scaledWeight }];
    const ratio = worstAspectRatio(nextRow, nextRowArea, side);

    if (ratio > best) {
      const remainingItems = items.slice(i);
      const remainingWeight = remainingItems.reduce((s, it) => s + it.weight, 0);
      const { nodes, remaining } = layoutRow(row.map((_, idx) => items[idx]), rect, totalWeight, isHorizontal);
      return [...nodes, ...squarify(remainingItems, remaining, remainingWeight)];
    }

    row.push({ ...items[i], weight: scaledWeight });
    rowArea = nextRowArea;
    best = ratio;
  }

  const { nodes } = layoutRow(items, rect, totalWeight, isHorizontal);
  return nodes;
}

export function treemap(items: TreemapInput[], bounds: Rect): TreemapNode[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);

  if (totalWeight <= 0) return [];

  return squarify(sorted, bounds, totalWeight);
}
