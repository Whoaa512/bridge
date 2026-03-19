import type { Project } from "../core/types";

export function computeWeight(project: Project): number {
  const loc = project.size?.loc ?? 100;
  const files = project.size?.files ?? 10;
  const deps = project.size?.deps ?? 0;

  const raw = loc * 0.6 + files * 20 * 0.25 + deps * 50 * 0.15;
  return Math.max(raw, 100);
}
