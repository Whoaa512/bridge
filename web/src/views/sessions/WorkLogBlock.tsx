import { useState } from "react";
import type { WorkLogGroup } from "./work-log";
import ToolCallBlock from "./ToolCallBlock";
import { colors, spacing, font, radius } from "../../ui/tokens";

interface Props {
  groups: WorkLogGroup[];
}

export default function WorkLogBlock({ groups }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (groups.length === 0) return null;

  const totalTools = groups.reduce((n, g) => n + g.tools.length, 0);
  if (totalTools === 1) {
    return <ToolCallBlock tool={groups[0].tools[0]} />;
  }

  const allComplete = groups.every((g) => g.allComplete);
  const hasErrors = groups.some((g) => g.hasErrors);

  const statusIcon = hasErrors ? "✗" : allComplete ? "✓" : "⟳";
  const statusColor = hasErrors ? colors.error : allComplete ? colors.success : colors.streaming;
  const statusStyle: React.CSSProperties = {
    color: statusColor,
    ...((!allComplete && !hasErrors) ? { animation: "spin 1s linear infinite" } : {}),
  };

  const summary = groups.map((g) => g.label).join(" · ");

  return (
    <div style={styles.container}>
      <button onClick={() => setExpanded(!expanded)} style={styles.header}>
        <span style={styles.chevron}>{expanded ? "▾" : "▸"}</span>
        <span style={statusStyle}>{statusIcon}</span>
        <span style={styles.summary}>{summary}</span>
      </button>
      {expanded && (
        <div style={styles.body}>
          {groups.flatMap((g) =>
            g.tools.map((tc) => <ToolCallBlock key={tc.id} tool={tc} />)
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    margin: `${spacing.xs}px 0`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: `6px 10px`,
    border: "none",
    background: colors.bgRaised,
    color: colors.textMuted,
    fontSize: font.sizeMd,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left",
  },
  chevron: {
    fontSize: font.sizeXs,
    width: 12,
    flexShrink: 0,
  },
  summary: {
    color: colors.text,
    flex: 1,
  },
  body: {
    padding: spacing.sm,
    background: colors.bg,
    borderTop: `1px solid ${colors.border}`,
  },
};
