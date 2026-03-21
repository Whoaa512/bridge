import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";

export type WorkspaceFilter = "all" | "has_prs" | "active_agents" | "stale" | "uncommitted" | "behind_remote" | "failing_ci";

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
  if (filter === "has_prs") return result.filter((p) => p.prs.length > 0);
  if (filter === "active_agents") return result.filter((p) => (sessionsByProject.get(p.id)?.length ?? 0) > 0);
  if (filter === "stale") return result.filter((p) => (p.activity?.staleDays ?? 0) > 14);
  if (filter === "uncommitted") return result.filter((p) => (p.git?.uncommitted ?? 0) > 0);
  if (filter === "behind_remote") return result.filter((p) => (p.git?.behind ?? 0) > 0);
  if (filter === "failing_ci") return result.filter((p) => p.ci?.status === "failing" || p.ci?.status === "failed");

  return result;
}

const PILL_FILTERS = new Set<WorkspaceFilter>(["all", "has_prs", "active_agents", "stale"]);

export function isPillFilter(f: WorkspaceFilter): boolean {
  return PILL_FILTERS.has(f);
}

const FILTER_LABELS: Record<WorkspaceFilter, string> = {
  all: "All",
  has_prs: "Has PRs",
  active_agents: "Active Agents",
  stale: "Stale",
  uncommitted: "Uncommitted",
  behind_remote: "Behind Remote",
  failing_ci: "Failing CI",
};

export function filterLabel(f: WorkspaceFilter): string {
  return FILTER_LABELS[f] ?? f;
}
