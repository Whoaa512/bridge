import type { Project } from "../../core/types";
import { relativeTime } from "./time-utils";

interface Props {
  project: Project;
}

export default function ProjectCard({ project }: Props) {
  const isStale = (project.activity?.staleDays ?? 0) > 14;
  const uncommitted = project.git?.uncommitted ?? 0;
  const prCount = project.prs.length;
  const lastActivity = project.activity?.lastTouch
    ? relativeTime(project.activity.lastTouch)
    : project.git?.lastCommit
      ? relativeTime(project.git.lastCommit)
      : "unknown";

  return (
    <div style={{ ...styles.card, ...(isStale ? styles.stale : {}) }}>
      <div style={styles.header}>
        <span style={styles.name}>{project.name}</span>
        {uncommitted > 0 && (
          <span style={styles.uncommittedBadge}>{uncommitted}</span>
        )}
      </div>
      <div style={styles.branch}>
        {project.git?.branch ?? "—"}
      </div>
      <div style={styles.footer}>
        {prCount > 0 && (
          <span style={styles.prBadge}>{prCount} PR{prCount > 1 ? "s" : ""}</span>
        )}
        <span style={styles.time}>{lastActivity}</span>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 8,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  stale: {
    opacity: 0.5,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    color: "#c9d1d9",
    fontWeight: 600,
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  uncommittedBadge: {
    background: "rgba(210, 153, 34, 0.2)",
    color: "#d29922",
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    flexShrink: 0,
  },
  branch: {
    color: "#8b949e",
    fontSize: 12,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  prBadge: {
    background: "rgba(56, 139, 253, 0.15)",
    color: "#58a6ff",
    fontSize: 11,
    fontWeight: 500,
    padding: "2px 6px",
    borderRadius: 4,
  },
  time: {
    color: "#8b949e",
    fontSize: 11,
    marginLeft: "auto",
  },
};
