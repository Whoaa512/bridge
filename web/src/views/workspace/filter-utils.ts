import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";

export type WorkspaceFilter = "all" | "has_prs" | "active_agents" | "stale";

export function filterWorkspaceProjects(
  projects: Project[],
  filter: WorkspaceFilter,
  searchQuery: string,
  sessionsByProject: Map<string, SessionInfo[]>,
): Project[] {
  let result = projects;

  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter((p) => p.name.toLowerCase().includes(q));
  }

  if (filter === "all") return result;

  if (filter === "has_prs") {
    return result.filter((p) => p.prs.length > 0);
  }

  if (filter === "active_agents") {
    return result.filter((p) => (sessionsByProject.get(p.id)?.length ?? 0) > 0);
  }

  return result.filter((p) => (p.activity?.staleDays ?? 0) > 14);
}
