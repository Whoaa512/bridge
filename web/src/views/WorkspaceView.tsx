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
import { filterWorkspaceProjects, type WorkspaceFilter } from "./workspace/filter-utils";

export default function WorkspaceView() {
  const spec = useBridgeStore((s) => s.spec);
  const sessions = useBridgeStore((s) => s.sessions);

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
    return filterProjects(spec.projects, DEFAULT_FILTER);
  }, [spec]);

  const attentionItems = useMemo(() => computeAttentionItems(projects, sessions), [projects, sessions]);

  const stats = useMemo(() => ({
    uncommittedCount: projects.filter((p) => (p.git?.uncommitted ?? 0) > 0).length,
    prCount: projects.reduce((sum, p) => sum + p.prs.length, 0),
    agentCount: Array.from(sessions.values()).filter((s) => s.state === "idle" || s.state === "streaming").length,
  }), [projects, sessions]);

  const filtered = useMemo(
    () => filterWorkspaceProjects(projects, activeFilter, searchQuery, sessionsByProject),
    [projects, activeFilter, searchQuery, sessionsByProject],
  );

  if (!spec) {
    return <div style={styles.empty}>Loading workspace…</div>;
  }

  return (
    <div style={styles.container}>
      <AttentionBar items={attentionItems} onFilterClick={setActiveFilter} />
      <StatsBar
        projectCount={projects.length}
        uncommittedCount={stats.uncommittedCount}
        prCount={stats.prCount}
        agentCount={stats.agentCount}
      />
      <SearchFilter
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />
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
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 12,
    padding: 16,
    overflowY: "auto",
    flex: 1,
  },
};
