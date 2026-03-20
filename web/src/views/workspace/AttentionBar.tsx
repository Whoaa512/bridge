import type { Project } from "../../core/types";

interface Props {
  items: string[];
}

export default function AttentionBar({ items }: Props) {
  if (items.length === 0) {
    return (
      <div style={styles.bar}>
        <span style={styles.icon}>✓</span>
        <span style={styles.text}>No items need attention</span>
      </div>
    );
  }

  return (
    <div style={{ ...styles.bar, ...styles.active }}>
      <span style={styles.icon}>⚠</span>
      {items.map((item, i) => (
        <span key={i} style={styles.item}>{item}</span>
      ))}
    </div>
  );
}

export function computeAttentionItems(projects: Project[]): string[] {
  const items: string[] = [];

  const uncommitted = projects.filter((p) => p.git && p.git.uncommitted > 0).length;
  if (uncommitted > 0) items.push(`${uncommitted} project${uncommitted > 1 ? "s" : ""} with uncommitted changes`);

  const stale = projects.filter((p) => p.activity && p.activity.staleDays > 14).length;
  if (stale > 0) items.push(`${stale} stale project${stale > 1 ? "s" : ""}`);

  const reviewPRs = projects.reduce((count, p) => {
    return count + p.prs.filter((pr) => pr.state === "open" && pr.reviewStatus === "changes_requested").length;
  }, 0);
  if (reviewPRs > 0) items.push(`${reviewPRs} PR${reviewPRs > 1 ? "s" : ""} need review`);

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
  active: {
    background: "rgba(210, 153, 34, 0.08)",
    borderBottom: "1px solid rgba(210, 153, 34, 0.3)",
  },
  icon: {
    fontSize: 14,
  },
  text: {
    color: "#8b949e",
  },
  item: {
    color: "#d29922",
    marginRight: 12,
  },
};
