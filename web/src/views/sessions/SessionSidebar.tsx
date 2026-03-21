import { useMemo } from "react";
import { useBridgeStore } from "../../store";
import type { SessionInfo } from "../../agent/ws-types";
import type { Project } from "../../core/types";
import { sendSessionCreate } from "../../agent/commands";

const STATE_COLORS: Record<string, string> = {
  idle: "#8b949e",
  streaming: "#58a6ff",
  compacting: "#d29922",
};

function SessionRow({ session, isActive, onClick }: {
  session: SessionInfo;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{ ...styles.sessionRow, ...(isActive ? styles.sessionActive : {}) }}>
      <div style={styles.sessionTitle}>
        {session.model}
        <span style={{ ...styles.stateDot, background: STATE_COLORS[session.state] ?? "#8b949e" }} />
      </div>
      <div style={styles.sessionMeta}>{session.state}</div>
    </button>
  );
}

function ProjectGroup({ project, sessions, activeSessionId, onSelect, onNew }: {
  project: Project;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: (project: Project) => void;
}) {
  const expanded = useBridgeStore((s) => s.expandedProjects.has(project.id));
  const toggle = useBridgeStore((s) => s.toggleProjectExpanded);

  const hasActive = sessions.some((s) => s.state === "streaming");

  return (
    <div style={styles.group}>
      <div style={styles.projectHeader}>
        <button onClick={() => toggle(project.id)} style={styles.projectToggle}>
          <span style={{
            ...styles.chevron,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}>›</span>
          {!expanded && hasActive && <span style={styles.activeDot} />}
          <span style={styles.projectName}>{project.name}</span>
          <span style={styles.sessionCount}>{sessions.length}</span>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onNew(project); }}
          style={styles.addBtn}
          title={`New session in ${project.name}`}
        >+</button>
      </div>
      {expanded && (
        <div style={styles.sessionList}>
          {sessions.length === 0 ? (
            <div style={styles.noSessions}>No sessions</div>
          ) : (
            sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                isActive={s.id === activeSessionId}
                onClick={() => onSelect(s.id)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function SessionSidebar() {
  const sessions = useBridgeStore((s) => s.sessions);
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const setActiveSessionId = useBridgeStore((s) => s.setActiveSessionId);
  const spec = useBridgeStore((s) => s.spec);

  const projects = spec?.projects ?? [];
  const sessionList = Array.from(sessions.values());

  const { projectsWithSessions, projectsWithout } = useMemo(() => {
    const sessionsByProject = new Map<string, SessionInfo[]>();
    for (const s of sessionList) {
      const key = s.projectId || "__unlinked";
      const list = sessionsByProject.get(key) ?? [];
      list.push(s);
      sessionsByProject.set(key, list);
    }

    const withSessions: { project: Project; sessions: SessionInfo[] }[] = [];
    const without: Project[] = [];
    const seen = new Set<string>();

    for (const project of projects) {
      const pSessions = sessionsByProject.get(project.id);
      if (pSessions && pSessions.length > 0) {
        withSessions.push({ project, sessions: pSessions });
        seen.add(project.id);
      } else {
        without.push(project);
      }
    }

    return { projectsWithSessions: withSessions, projectsWithout: without };
  }, [projects, sessionList]);

  function handleNewSession(project: Project) {
    const store = useBridgeStore.getState();
    if (!store.expandedProjects.has(project.id)) {
      store.toggleProjectExpanded(project.id);
    }
    sendSessionCreate(project.path, project.id);
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>Projects</span>
      </div>
      <div style={styles.list}>
        {projectsWithSessions.map(({ project, sessions: pSessions }) => (
          <ProjectGroup
            key={project.id}
            project={project}
            sessions={pSessions}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onNew={handleNewSession}
          />
        ))}
        {projectsWithout.length > 0 && projectsWithSessions.length > 0 && (
          <div style={styles.divider} />
        )}
        {projectsWithout.map((project) => (
          <ProjectGroup
            key={project.id}
            project={project}
            sessions={[]}
            activeSessionId={activeSessionId}
            onSelect={setActiveSessionId}
            onNew={handleNewSession}
          />
        ))}
      </div>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 260,
    flexShrink: 0,
    background: "#161b22",
    borderRight: "1px solid #30363d",
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 14px 8px",
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    color: "#8b949e",
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "0 6px 8px",
  },
  group: {
    marginBottom: 2,
  },
  projectHeader: {
    display: "flex",
    alignItems: "center",
    borderRadius: 6,
  },
  projectToggle: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 8px",
    border: "none",
    background: "transparent",
    color: "#c9d1d9",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left" as const,
    borderRadius: 6,
    minWidth: 0,
  },
  chevron: {
    fontSize: 16,
    lineHeight: 1,
    color: "#8b949e",
    transition: "transform 0.15s",
    flexShrink: 0,
    width: 10,
    textAlign: "center" as const,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "#58a6ff",
    flexShrink: 0,
    marginLeft: -2,
  },
  projectName: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  sessionCount: {
    fontSize: 11,
    color: "#8b949e",
    flexShrink: 0,
  },
  addBtn: {
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: "#8b949e",
    fontSize: 16,
    cursor: "pointer",
    borderRadius: 4,
    flexShrink: 0,
    fontFamily: "inherit",
    opacity: 0.6,
    transition: "opacity 0.15s",
  },
  sessionList: {
    paddingLeft: 18,
  },
  sessionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "5px 8px",
    border: "none",
    borderRadius: 4,
    background: "transparent",
    color: "#c9d1d9",
    textAlign: "left" as const,
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
    marginBottom: 1,
  },
  sessionActive: {
    background: "#21262d",
  },
  sessionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
  },
  sessionMeta: {
    fontSize: 10,
    color: "#8b949e",
    flexShrink: 0,
    marginLeft: 8,
  },
  noSessions: {
    padding: "4px 8px",
    fontSize: 11,
    color: "#484f58",
  },
  divider: {
    height: 1,
    background: "#21262d",
    margin: "6px 8px",
  },
};
