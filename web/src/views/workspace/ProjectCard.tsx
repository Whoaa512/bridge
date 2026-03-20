import { useEffect } from "react";
import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";
import { relativeTime } from "./time-utils";

interface Props {
  project: Project;
  sessions?: SessionInfo[];
}

const KIND_LABELS: Record<string, string> = {
  monorepo_child: "child",
  directory: "dir",
};

function injectPulseKeyframe() {
  if (document.getElementById("agent-pulse-css")) return;
  const style = document.createElement("style");
  style.id = "agent-pulse-css";
  style.textContent = `@keyframes agent-pulse { 0%,100%{opacity:.4} 50%{opacity:1} }`;
  document.head.appendChild(style);
}

export default function ProjectCard({ project, sessions }: Props) {
  useEffect(injectPulseKeyframe, []);

  const isStale = (project.activity?.staleDays ?? 0) > 14;
  const uncommitted = project.git?.uncommitted ?? 0;
  const prCount = project.prs.length;
  const lastActivity = project.activity?.lastTouch
    ? relativeTime(project.activity.lastTouch)
    : project.git?.lastCommit
      ? relativeTime(project.git.lastCommit)
      : "unknown";

  const hasAgents = sessions && sessions.length > 0;
  const isStreaming = hasAgents && sessions.some((s) => s.state === "streaming");
  const kindLabel = KIND_LABELS[project.kind];

  return (
    <div style={{ ...styles.card, ...(isStale ? styles.stale : {}) }}>
      <div style={styles.header}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{project.name}</span>
          {kindLabel && <span style={styles.kindPill}>{kindLabel}</span>}
        </div>
        {uncommitted > 0 && (
          <span style={styles.uncommittedBadge}>{uncommitted}</span>
        )}
      </div>
      <div style={styles.branch}>
        {project.git?.branch ?? "—"}
      </div>
      <div style={styles.footer}>
        {hasAgents && (
          <span style={styles.agentBadge}>
            <span
              style={{
                ...styles.agentDot,
                background: isStreaming ? "#58a6ff" : "#39d353",
                ...(isStreaming ? { animation: "agent-pulse 1.5s ease-in-out infinite" } : {}),
              }}
            />
            {sessions.length} agent{sessions.length > 1 ? "s" : ""}
          </span>
        )}
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
  nameRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    overflow: "hidden",
    minWidth: 0,
  },
  name: {
    color: "#c9d1d9",
    fontWeight: 600,
    fontSize: 14,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  kindPill: {
    color: "#8b949e",
    fontSize: 10,
    padding: "1px 5px",
    border: "1px solid #30363d",
    borderRadius: 4,
    flexShrink: 0,
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
  agentBadge: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    color: "#39d353",
    fontSize: 11,
    fontWeight: 500,
  },
  agentDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    flexShrink: 0,
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
