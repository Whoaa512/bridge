import { useMemo, useState, useEffect } from "react";
import { useBridgeStore } from "../../store";
import type { SessionInfo, HistoricalSession } from "../../agent/ws-types";
import type { Project } from "../../core/types";
import { sendSessionCreate, sendProjectPin, sendProjectUnpin, sendProjectOptOut, sendSessionHistory } from "../../agent/commands";
import ContextMenu from "../../ui/ContextMenu";
import type { ContextMenuItem } from "../../ui/ContextMenu";
import { relativeTime } from "../../ui/time";

type ProjectEntry = { project: Project; sessions: SessionInfo[]; pinned: boolean };

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

function HistoryRow({ session }: { session: HistoricalSession }) {
  const label = session.topic || session.model || "Session";
  return (
    <div style={styles.historyRow}>
      <div style={styles.historyLabel} title={session.topic}>{label}</div>
      <div style={styles.historyTime}>{relativeTime(session.timestamp, "terse")}</div>
    </div>
  );
}

function ProjectGroup({ project, sessions, activeSessionId, onSelect, onNew, pinned, onPin, onContextMenu }: {
  project: Project;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onNew: (project: Project) => void;
  pinned: boolean;
  onPin: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const expanded = useBridgeStore((s) => s.expandedProjects.has(project.id));
  const toggle = useBridgeStore((s) => s.toggleProjectExpanded);
  const history = useBridgeStore((s) => s.sessionHistory.get(project.path));
  const [hovered, setHovered] = useState(false);
  const [historyRequested, setHistoryRequested] = useState(false);

  useEffect(() => {
    if (!expanded || historyRequested) return;
    const history = useBridgeStore.getState().sessionHistory;
    if (history.has(project.path)) return;
    setHistoryRequested(true);
    sendSessionHistory(project.path);
  }, [expanded, historyRequested, project.path]);

  const hasActive = sessions.some((s) => s.state === "streaming");
  const showPinBtn = hovered || pinned;

  return (
    <div style={styles.group}>
      <div
        style={styles.projectHeader}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={onContextMenu}
      >
        <button onClick={() => toggle(project.id)} style={styles.projectToggle}>
          <span style={{
            ...styles.chevron,
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
          }}>›</span>
          {!expanded && hasActive && <span style={styles.activeDot} />}
          <span style={styles.projectName}>{project.name}</span>
          <span style={styles.sessionCount}>{sessions.length}</span>
        </button>
        {showPinBtn && (
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            style={{ ...styles.pinBtn, color: pinned ? "#d29922" : "#8b949e" }}
            title={pinned ? "Unpin" : "Pin"}
          >{pinned ? "★" : "☆"}</button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onNew(project); }}
          style={styles.addBtn}
          title={`New session in ${project.name}`}
        >+</button>
      </div>
      {expanded && (
        <div style={styles.sessionList}>
          {sessions.length === 0 && (!history || history.length === 0) ? (
            <div style={styles.noSessions}>No sessions</div>
          ) : (
            <>
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  isActive={s.id === activeSessionId}
                  onClick={() => onSelect(s.id)}
                />
              ))}
              {history && history.length > 0 && (
                <>
                  <div style={styles.historyHeader}>History</div>
                  {history.map((h) => (
                    <HistoryRow key={h.id} session={h} />
                  ))}
                </>
              )}
            </>
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
  const focusedPaths = useBridgeStore((s) => s.focusedPaths);
  const pinnedPaths = useBridgeStore((s) => s.pinnedPaths);

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; projectId: string } | null>(null);

  const sortedEntries = useMemo(() => {
    const all = spec?.projects ?? [];
    const filtered = focusedPaths.size === 0 ? all : all.filter((p) => focusedPaths.has(p.path));

    const sessionsByProject = new Map<string, SessionInfo[]>();
    for (const s of sessions.values()) {
      const key = s.projectId || "__unlinked";
      const list = sessionsByProject.get(key) ?? [];
      list.push(s);
      sessionsByProject.set(key, list);
    }

    const entries: ProjectEntry[] = filtered.map((project) => ({
      project,
      sessions: sessionsByProject.get(project.id) ?? [],
      pinned: pinnedPaths.has(project.path),
    }));

    entries.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      const aHas = a.sessions.length > 0;
      const bHas = b.sessions.length > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return a.project.name.localeCompare(b.project.name);
    });

    return entries;
  }, [spec, focusedPaths, pinnedPaths, sessions]);

  const pinnedCount = sortedEntries.filter((e) => e.pinned).length;
  const hasDivider = pinnedCount > 0 && pinnedCount < sortedEntries.length;

  function handleNewSession(project: Project) {
    const store = useBridgeStore.getState();
    if (!store.expandedProjects.has(project.id)) {
      store.toggleProjectExpanded(project.id);
    }
    sendSessionCreate(project.path, project.id);
  }

  function handlePin(projectPath: string) {
    const store = useBridgeStore.getState();
    const isPinned = store.pinnedPaths.has(projectPath);
    if (isPinned) {
      sendProjectUnpin(projectPath);
    } else {
      sendProjectPin(projectPath);
    }
  }

  function handleContextMenu(e: React.MouseEvent, projectPath: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, projectId: projectPath });
  }

  function buildContextMenuItems(projectPath: string): ContextMenuItem[] {
    const store = useBridgeStore.getState();
    const isPinned = store.pinnedPaths.has(projectPath);
    return [
      {
        label: isPinned ? "Unpin" : "Pin",
        onClick: () => handlePin(projectPath),
      },
      {
        label: "Remove from sidebar",
        danger: true,
        onClick: () => {
          sendProjectOptOut(projectPath);
        },
      },
      {
        label: "View complexity",
        onClick: () => store.setActiveView("complexity"),
      },
    ];
  }

  function handleAddProject() {
    useBridgeStore.getState().setShowProjectSearch(true);
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <span style={styles.headerLabel}>Projects ({sortedEntries.length})</span>
      </div>
      <div style={styles.list}>
        {sortedEntries.map((entry, i) => (
          <div key={entry.project.id}>
            {hasDivider && i === pinnedCount && <div style={styles.divider} />}
            <ProjectGroup
              project={entry.project}
              sessions={entry.sessions}
              activeSessionId={activeSessionId}
              onSelect={setActiveSessionId}
              onNew={handleNewSession}
              pinned={entry.pinned}
              onPin={() => handlePin(entry.project.path)}
              onContextMenu={(e) => handleContextMenu(e, entry.project.path)}
            />
          </div>
        ))}
      </div>
      <button onClick={handleAddProject} style={styles.addProjectBtn}>
        <span style={styles.addProjectKbd}>⌘K</span> Add project
      </button>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={buildContextMenuItems(contextMenu.projectId)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: 260,
    flexShrink: 0,
    background: "#161b22",
    borderRight: "1px solid #30363d",
    display: "flex",
    flexDirection: "column",
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
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#8b949e",
  },
  list: {
    flex: 1,
    overflowY: "auto",
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
    textAlign: "left",
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
    textAlign: "center",
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
    whiteSpace: "nowrap",
  },
  sessionCount: {
    fontSize: 11,
    color: "#8b949e",
    flexShrink: 0,
  },
  pinBtn: {
    width: 24,
    height: 24,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    fontSize: 13,
    cursor: "pointer",
    borderRadius: 4,
    flexShrink: 0,
    fontFamily: "inherit",
    padding: 0,
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
    textAlign: "left",
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
    whiteSpace: "nowrap",
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
  historyHeader: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "#484f58",
    padding: "8px 8px 4px",
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 8px",
    borderRadius: 4,
    gap: 8,
  },
  historyLabel: {
    fontSize: 11,
    color: "#6e7681",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  historyTime: {
    fontSize: 10,
    color: "#484f58",
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: "#21262d",
    margin: "6px 8px",
  },
  addProjectBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 14px",
    border: "none",
    borderTop: "1px solid #21262d",
    background: "transparent",
    color: "#8b949e",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  addProjectKbd: {
    fontSize: 10,
    padding: "1px 4px",
    borderRadius: 3,
    background: "#21262d",
    border: "1px solid #30363d",
    color: "#8b949e",
  },
};
