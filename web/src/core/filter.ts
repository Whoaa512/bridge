import type { Project } from "./types";

export interface FilterOptions {
  showMonorepoChildren: boolean;
}

export const DEFAULT_FILTER: FilterOptions = {
  showMonorepoChildren: false,
};

export function filterProjects(projects: Project[], options: FilterOptions): Project[] {
  if (options.showMonorepoChildren) return projects;
  return projects.filter((p) => p.kind !== "monorepo_child");
}
