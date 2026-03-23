import { useState } from "react";
import type { ToolCallInfo } from "../../store";
import { colors, spacing, font, radius } from "../../ui/tokens";

interface Props {
  tool: ToolCallInfo;
}

export default function ToolCallBlock({ tool }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isRunning = tool.result === undefined;

  return (
    <div style={styles.container}>
      <button onClick={() => setExpanded(!expanded)} style={styles.header}>
        <span style={styles.chevron}>{expanded ? "▾" : "▸"}</span>
        <span style={styles.name}>{tool.name}</span>
        {isRunning && <span style={styles.running}>⟳</span>}
        {tool.isError && <span style={styles.error}>✗</span>}
        {!isRunning && !tool.isError && <span style={styles.success}>✓</span>}
      </button>
      {expanded && (
        <div style={styles.body}>
          <pre style={styles.pre}>{tool.args}</pre>
          {tool.result !== undefined && (
            <pre style={{ ...styles.pre, ...(tool.isError ? styles.errorText : {}) }}>
              {tool.result}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

const styles = {
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
    textAlign: "left" as const,
  },
  chevron: {
    fontSize: font.sizeXs,
    width: 12,
    flexShrink: 0,
  },
  name: {
    color: colors.purple,
    fontFamily: font.mono,
    flex: 1,
  },
  running: {
    color: colors.streaming,
    animation: "spin 1s linear infinite",
  },
  error: {
    color: colors.error,
  },
  success: {
    color: colors.success,
  },
  body: {
    padding: spacing.sm,
    background: colors.bg,
    borderTop: `1px solid ${colors.border}`,
  },
  pre: {
    margin: 0,
    padding: spacing.sm,
    fontSize: font.sizeSm,
    lineHeight: 1.5,
    fontFamily: font.mono,
    color: colors.text,
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: 300,
    overflow: "auto",
  },
  errorText: {
    color: colors.error,
  },
};
