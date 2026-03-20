import { useBridgeStore } from "../../store";
import type { SessionInfo } from "../../agent/ws-types";
import SessionItem from "./SessionItem";

interface Props {
  onNewSession: () => void;
}

export default function SessionSidebar({ onNewSession }: Props) {
  const sessions = useBridgeStore((s) => s.sessions);
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const setActiveSessionId = useBridgeStore((s) => s.setActiveSessionId);
  const spec = useBridgeStore((s) => s.spec);

  const sessionList = Array.from(sessions.values());

  function projectName(session: SessionInfo): string {
    const project = spec?.projects.find((p) => p.id === session.projectId);
    return project?.name ?? session.projectId ?? session.cwd.split("/").pop() ?? "Session";
  }

  return (
    <div style={styles.sidebar}>
      <div style={styles.list}>
        {sessionList.map((session) => (
          <SessionItem
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            projectName={projectName(session)}
            onClick={() => setActiveSessionId(session.id)}
          />
        ))}
        {sessionList.length === 0 && (
          <div style={styles.empty}>No sessions</div>
        )}
      </div>
      <button onClick={onNewSession} style={styles.newBtn}>
        + New Session
      </button>
    </div>
  );
}

const styles = {
  sidebar: {
    width: 240,
    flexShrink: 0,
    background: "#161b22",
    borderRight: "1px solid #30363d",
    display: "flex",
    flexDirection: "column" as const,
    height: "100%",
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
  },
  empty: {
    padding: 16,
    color: "#8b949e",
    fontSize: 13,
    textAlign: "center" as const,
  },
  newBtn: {
    margin: 8,
    padding: "8px 12px",
    border: "1px solid #30363d",
    borderRadius: 6,
    background: "#21262d",
    color: "#c9d1d9",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
