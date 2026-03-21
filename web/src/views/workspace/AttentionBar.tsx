import type { AttentionItem, AttentionSeverity } from "./attention-utils";
import type { WorkspaceFilter } from "./filter-utils";

interface Props {
  items: AttentionItem[];
  onFilterClick?: (filter: WorkspaceFilter) => void;
}

const severityColors: Record<AttentionSeverity, string> = {
  urgent: "#f85149",
  warning: "#d29922",
  info: "#58a6ff",
};

export default function AttentionBar({ items, onFilterClick }: Props) {
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
          onClick={() => item.filter && onFilterClick?.(item.filter)}
        >
          {item.message}
        </span>
      ))}
    </div>
  );
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
