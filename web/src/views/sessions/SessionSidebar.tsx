import { useMemo, useState, useEffect } from "react";
import { useBridgeStore } from "../../store";
import type { SessionInfo, HistoricalSession } from "../../agent/ws-types";
import type { Project } from "../../core/types";
import { sendSessionCreate, sendProjectPin, sendProjectUnpin, sendProjectOptOut, sendSessionHistory, sendSessionResume } from "../../agent/commands";
import ContextMenu from "../../ui/ContextMenu";
import type { ContextMenuItem } from "../../ui/ContextMenu";
import { relativeTime } from "../../ui/time";
import { colors, spacing, font, radius } from "../../ui/tokens";

type ProjectEntry = { project: Project; sessions: SessionInfo[]; pinned: boolean };

const STATE_COLORS: Record<string, string> = {
  idle: colors.textMuted,
  streaming: colors.streaming,
  compacting: colors.warning,
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
        <span style={{ ...styles.stateDot, background: STATE_COLORS[session.state] ?? colors.textMuted }} />
      </div>
      <div style={styles.sessionMeta}>{session.state}</div>
    </button>
  );
}

function HistoryRow({ session, onResume }: { session: HistoricalSession; onResume: () => void }) {
  const label = session.topic || session.model || "Session";
  return (
    <button onClick={onResume} style={styles.historyRow}>
      <div style={styles.historyLabel} title={session.topic}>{label}</div>
      <div style={styles.historyTime}>{relativeTime(session.timestamp, "terse")}</div>
    </button>
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
            style={{ ...styles.pinBtn, color: pinned ? colors.warning : colors.textMuted }}
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
                    <HistoryRow
                      key={h.id}
                      session={h}
                      onResume={() => sendSessionResume(h.cwd, project.id, h.filePath)}
                    />
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
    const filtered = all.filter((p) => focusedPaths.has(p.path));

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
    background: colors.bgRaised,
    borderRight: `1px solid ${colors.border}`,
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.md}px 14px ${spacing.sm}px`,
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: font.sizeXs,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: colors.textMuted,
  },
  list: {
    flex: 1,
    overflowY: "auto",
    padding: `0 6px ${spacing.sm}px`,
  },
  group: {
    marginBottom: 2,
  },
  projectHeader: {
    display: "flex",
    alignItems: "center",
    borderRadius: radius.md,
  },
  projectToggle: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: `6px ${spacing.sm}px`,
    border: "none",
    background: "transparent",
    color: colors.text,
    fontSize: font.sizeLg,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
    borderRadius: radius.md,
    minWidth: 0,
  },
  chevron: {
    fontSize: font.sizeTitle,
    lineHeight: 1,
    color: colors.textMuted,
    transition: "transform 0.15s",
    flexShrink: 0,
    width: 10,
    textAlign: "center",
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: colors.streaming,
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
    fontSize: font.sizeSm,
    color: colors.textMuted,
    flexShrink: 0,
  },
  pinBtn: {
    width: spacing.xl,
    height: spacing.xl,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    fontSize: font.sizeLg,
    cursor: "pointer",
    borderRadius: radius.sm,
    flexShrink: 0,
    fontFamily: "inherit",
    padding: 0,
  },
  addBtn: {
    width: spacing.xl,
    height: spacing.xl,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    background: "transparent",
    color: colors.textMuted,
    fontSize: font.sizeTitle,
    cursor: "pointer",
    borderRadius: radius.sm,
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
    padding: `5px ${spacing.sm}px`,
    border: "none",
    borderRadius: radius.sm,
    background: "transparent",
    color: colors.text,
    textAlign: "left",
    cursor: "pointer",
    fontSize: font.sizeMd,
    fontFamily: "inherit",
    marginBottom: 1,
  },
  sessionActive: {
    background: colors.bgOverlay,
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
    fontSize: font.sizeXs,
    color: colors.textMuted,
    flexShrink: 0,
    marginLeft: spacing.sm,
  },
  noSessions: {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    fontSize: font.sizeSm,
    color: colors.textFaint,
  },
  historyHeader: {
    fontSize: font.sizeXs,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: colors.textFaint,
    padding: `${spacing.sm}px ${spacing.sm}px ${spacing.xs}px`,
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: `5px ${spacing.sm}px`,
    border: "none",
    borderRadius: radius.sm,
    background: "transparent",
    color: colors.text,
    textAlign: "left" as const,
    cursor: "pointer",
    fontSize: font.sizeMd,
    fontFamily: "inherit",
    marginBottom: 1,
    gap: spacing.sm,
  },
  historyLabel: {
    fontSize: font.sizeSm,
    color: "#6e7681",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  historyTime: {
    fontSize: font.sizeXs,
    color: colors.textFaint,
    flexShrink: 0,
  },
  divider: {
    height: 1,
    background: colors.borderLight,
    margin: `6px ${spacing.sm}px`,
  },
  addProjectBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: `10px 14px`,
    border: "none",
    borderTop: `1px solid ${colors.borderLight}`,
    background: "transparent",
    color: colors.textMuted,
    fontSize: font.sizeMd,
    cursor: "pointer",
    fontFamily: "inherit",
    flexShrink: 0,
  },
  addProjectKbd: {
    fontSize: font.sizeXs,
    padding: `1px ${spacing.xs}px`,
    borderRadius: 3,
    background: colors.bgOverlay,
    border: `1px solid ${colors.border}`,
    color: colors.textMuted,
  },
};
