import type { SessionInfo } from "../../agent/ws-types";

const STATE_COLORS: Record<string, string> = {
  idle: "#8b949e",
  streaming: "#58a6ff",
  compacting: "#d29922",
};

interface Props {
  session: SessionInfo;
  isActive: boolean;
  projectName: string;
  onClick: () => void;
}

export default function SessionItem({ session, isActive, projectName, onClick }: Props) {
  return (
    <button onClick={onClick} style={{ ...styles.item, ...(isActive ? styles.active : {}) }}>
      <div style={styles.name}>{projectName}</div>
      <div style={styles.meta}>
        <span style={styles.model}>{session.model}</span>
        <span style={{ ...styles.badge, color: STATE_COLORS[session.state] ?? "#8b949e" }}>
          {session.state}
        </span>
      </div>
    </button>
  );
}

const styles = {
  item: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    border: "none",
    borderBottom: "1px solid #21262d",
    background: "transparent",
    color: "#c9d1d9",
    textAlign: "left" as const,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
  },
  active: {
    background: "#21262d",
  },
  name: {
    fontWeight: 600,
    marginBottom: 2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  meta: {
    display: "flex",
    gap: 8,
    fontSize: 11,
    color: "#8b949e",
  },
  model: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    flex: 1,
  },
  badge: {
    fontWeight: 500,
    flexShrink: 0,
  },
};
