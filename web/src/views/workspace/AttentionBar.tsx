import type { Project } from "../../core/types";
import type { SessionInfo } from "../../agent/ws-types";

export type AttentionSeverity = "info" | "warning" | "urgent";

export interface AttentionItem {
  message: string;
  severity: AttentionSeverity;
  filter?: string;
}

interface Props {
  items: AttentionItem[];
}

const severityColors: Record<AttentionSeverity, string> = {
  urgent: "#f85149",
  warning: "#d29922",
  info: "#58a6ff",
};

export default function AttentionBar({ items }: Props) {
  if (items.length === 0) {
    return (
      <div style={styles.bar}>
        <span style={styles.icon}>✓</span>
        <span style={styles.text}>No items need attention</span>
      </div>
    );
  }

  const highestSeverity = items.some((i) => i.severity === "urgent")
    ? "urgent"
    : items.some((i) => i.severity === "warning")
      ? "warning"
      : "info";

  const borderColor = severityColors[highestSeverity];

  return (
    <div style={{ ...styles.bar, background: `${borderColor}11`, borderBottom: `1px solid ${borderColor}4d` }}>
      <span style={styles.icon}>{highestSeverity === "info" ? "ℹ" : "⚠"}</span>
      {items.map((item, i) => (
        <span
          key={i}
          style={{ ...styles.item, color: severityColors[item.severity], cursor: item.filter ? "pointer" : "default" }}
        >
          {item.message}
        </span>
      ))}
    </div>
  );
}

export function computeAttentionItems(projects: Project[], sessions?: Map<string, SessionInfo>): AttentionItem[] {
  const items: AttentionItem[] = [];

  const failingCI = projects.filter((p) => p.ci?.status === "failing" || p.ci?.status === "failed").length;
  if (failingCI > 0) {
    items.push({
      message: `${failingCI} project${failingCI > 1 ? "s" : ""} with failing CI`,
      severity: "urgent",
      filter: "failing_ci",
    });
  }

  const reviewPRs = projects.reduce((count, p) => {
    return count + p.prs.filter((pr) => pr.state === "open" && (pr.reviewStatus === "changes_requested" || pr.reviewStatus === "review_required")).length;
  }, 0);
  if (reviewPRs > 0) {
    items.push({
      message: `${reviewPRs} PR${reviewPRs > 1 ? "s" : ""} need review`,
      severity: "warning",
      filter: "has_prs",
    });
  }

  const uncommitted = projects.filter((p) => p.git && p.git.uncommitted > 0).length;
  if (uncommitted > 0) {
    items.push({
      message: `${uncommitted} project${uncommitted > 1 ? "s" : ""} with uncommitted changes`,
      severity: "warning",
      filter: "uncommitted",
    });
  }

  const behind = projects.filter((p) => p.git && p.git.behind > 0).length;
  if (behind > 0) {
    items.push({
      message: `${behind} project${behind > 1 ? "s" : ""} behind remote`,
      severity: "warning",
      filter: "behind_remote",
    });
  }

  const stale = projects.filter((p) => p.activity && p.activity.staleDays > 14).length;
  if (stale > 0) {
    items.push({
      message: `${stale} stale project${stale > 1 ? "s" : ""}`,
      severity: "info",
      filter: "stale",
    });
  }

  if (sessions) {
    const streaming = Array.from(sessions.values()).filter((s) => s.state === "streaming").length;
    if (streaming > 0) {
      items.push({
        message: `${streaming} agent${streaming > 1 ? "s" : ""} actively streaming`,
        severity: "info",
        filter: "active_agents",
      });
    }
  }

  return items;
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 16px",
    borderBottom: "1px solid #30363d",
    color: "#8b949e",
    fontSize: 13,
    minHeight: 36,
  },
  icon: {
    fontSize: 14,
  },
  text: {
    color: "#8b949e",
  },
  item: {
    marginRight: 12,
  },
};
