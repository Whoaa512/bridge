import { useMemo, useState, useCallback } from "react";
import { useBridgeStore } from "../store";
import { filterProjects, DEFAULT_FILTER } from "../core/filter";
import type { SessionInfo } from "../agent/ws-types";
import type { Project } from "../core/types";
import { sendSessionCreate } from "../agent/commands";
import { pushView } from "../router";
import AttentionBar from "./workspace/AttentionBar";
import { computeAttentionItems } from "./workspace/attention-utils";
import StatsBar from "./workspace/StatsBar";
import SearchFilter from "./workspace/SearchFilter";
import ProjectCard from "./workspace/ProjectCard";
import { filterWorkspaceProjects, sortWorkspaceProjects, type WorkspaceFilter, type WorkspaceSort } from "./workspace/filter-utils";

export default function WorkspaceView() {
  const spec = useBridgeStore((s) => s.spec);
  const sessions = useBridgeStore((s) => s.sessions);
  const focusedPaths = useBridgeStore((s) => s.focusedPaths);
  const setShowProjectSearch = useBridgeStore((s) => s.setShowProjectSearch);

  const sessionsByProject = useMemo(() => {
    const map = new Map<string, SessionInfo[]>();
    for (const s of sessions.values()) {
      if (!s.projectId) continue;
      const list = map.get(s.projectId) ?? [];
      list.push(s);
      map.set(s.projectId, list);
    }
    return map;
  }, [sessions]);

  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<WorkspaceFilter>("all");
  const [activeSort, setActiveSort] = useState<WorkspaceSort>("activity");

  const handleCardClick = useCallback((project: Project, projectSessions?: SessionInfo[]) => {
    const store = useBridgeStore.getState();

    if (projectSessions && projectSessions.length > 0) {
      store.setActiveSessionId(projectSessions[0].id);
    } else {
      sendSessionCreate(project.path, project.id);
    }

    store.setActiveView("sessions");
    pushView("sessions");
  }, []);

  const projects = useMemo(() => {
    if (!spec) return [];
    const filtered = filterProjects(spec.projects, DEFAULT_FILTER);
    return filtered.filter((p) => focusedPaths.has(p.path));
  }, [spec, focusedPaths]);

  const attentionItems = useMemo(() => computeAttentionItems(projects, sessions), [projects, sessions]);

  const stats = useMemo(() => ({
    uncommittedCount: projects.filter((p) => (p.git?.uncommitted ?? 0) > 0).length,
    prCount: projects.reduce((sum, p) => sum + p.prs.length, 0),
    agentCount: Array.from(sessions.values()).filter((s) => s.state === "idle" || s.state === "streaming").length,
  }), [projects, sessions]);

  const filtered = useMemo(
    () => sortWorkspaceProjects(
      filterWorkspaceProjects(projects, activeFilter, searchQuery, sessionsByProject),
      activeSort,
    ),
    [projects, activeFilter, searchQuery, sessionsByProject, activeSort],
  );

  if (!spec) {
    return <div style={styles.empty}>Loading workspace…</div>;
  }

  return (
    <div style={styles.container}>
      <AttentionBar items={attentionItems} onFilterClick={setActiveFilter} />
      <div style={styles.statsRow}>
        <StatsBar
          projectCount={projects.length}
          uncommittedCount={stats.uncommittedCount}
          prCount={stats.prCount}
          agentCount={stats.agentCount}
        />
        <button
          style={styles.addButton}
          onClick={() => setShowProjectSearch(true)}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#30363d"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#21262d"; }}
        >
          + Add project
        </button>
      </div>
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
        activeSort={activeSort}
        onSortChange={setActiveSort}
      />
      {filtered.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyTitle}>No projects selected</div>
          <div style={styles.emptyHint}>Press ⌘K to add projects to your workspace</div>
          <button
            style={styles.emptyButton}
            onClick={() => setShowProjectSearch(true)}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#30363d"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#21262d"; }}
          >
            Add projects
          </button>
        </div>
      ) : (
        <div style={styles.grid}>
          {filtered.map((p) => {
            const ps = sessionsByProject.get(p.id);
            return (
              <ProjectCard
                key={p.id}
                project={p}
                sessions={ps}
                onClick={() => handleCardClick(p, ps)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0d1117",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: "#c9d1d9",
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#8b949e",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  statsRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "1px solid #30363d",
  },
  addButton: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 12px",
    borderRadius: 12,
    background: "#21262d",
    border: "1px solid #30363d",
    color: "#8b949e",
    fontSize: 12,
    cursor: "pointer",
    marginRight: 16,
    whiteSpace: "nowrap" as const,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 12,
    padding: 16,
    overflowY: "auto",
    flex: 1,
  },
  emptyState: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: "#c9d1d9",
  },
  emptyHint: {
    fontSize: 14,
    color: "#8b949e",
  },
  emptyButton: {
    marginTop: 8,
    padding: "8px 20px",
    borderRadius: 6,
    background: "#21262d",
    border: "1px solid #30363d",
    color: "#c9d1d9",
    fontSize: 14,
    cursor: "pointer",
  },
};
