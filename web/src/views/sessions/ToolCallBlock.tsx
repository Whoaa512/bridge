import { useState, useMemo } from "react";
import type { ToolCallInfo } from "../../store";
import { colors, spacing, font, radius } from "../../ui/tokens";
import { parseDiffStat } from "./diff-stats";
import SimpleDiff from "./SimpleDiff";

interface Props {
  tool: ToolCallInfo;
}

interface EditArgs {
  oldText: string;
  newText: string;
  path?: string;
}

function tryParseEditArgs(argsJson: string): EditArgs | null {
  try {
    const args = JSON.parse(argsJson);
    if (typeof args.oldText !== "string" || typeof args.newText !== "string") {
      return null;
    }
    return {
      oldText: args.oldText,
      newText: args.newText,
      path: typeof args.path === "string" ? args.path : undefined,
    };
  } catch {
    return null;
  }
}

export default function ToolCallBlock({ tool }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const isRunning = tool.result === undefined;
  const isEdit = /^edit$/i.test(tool.name);
  const editArgs = useMemo(
    () => (isEdit ? tryParseEditArgs(tool.args) : null),
    [isEdit, tool.args],
  );
  const diffStat = useMemo(
    () => parseDiffStat(tool.name, tool.args),
    [tool.name, tool.args],
  );

  return (
    <div style={styles.container}>
      <button onClick={() => setExpanded(!expanded)} style={styles.header}>
        <span style={styles.chevron}>{expanded ? "▾" : "▸"}</span>
        <span style={styles.name}>{tool.name}</span>
        {diffStat && (diffStat.additions > 0 || diffStat.deletions > 0) && (
          <span style={styles.diffBadge}>
            {diffStat.additions > 0 && (
              <span style={styles.additions}>+{diffStat.additions}</span>
            )}
            {diffStat.deletions > 0 && (
              <span style={styles.deletions}>-{diffStat.deletions}</span>
            )}
          </span>
        )}
        {editArgs && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowDiff(!showDiff);
              if (!expanded) setExpanded(true);
            }}
            style={{
              ...styles.diffToggle,
              color: showDiff ? colors.accent : colors.textMuted,
            }}
          >
            Diff
          </button>
        )}
        {isRunning && <span style={styles.running}>⟳</span>}
        {tool.isError && <span style={styles.error}>✗</span>}
        {!isRunning && !tool.isError && <span style={styles.success}>✓</span>}
      </button>
      {expanded && (
        <div style={styles.body}>
          {showDiff && editArgs ? (
            <SimpleDiff
              oldText={editArgs.oldText}
              newText={editArgs.newText}
              filePath={editArgs.path}
            />
          ) : (
            <>
              <pre style={styles.pre}>{tool.args}</pre>
              {tool.result !== undefined && (
                <pre
                  style={{
                    ...styles.pre,
                    ...(tool.isError ? styles.errorText : {}),
                  }}
                >
                  {tool.result}
                </pre>
              )}
            </>
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
  diffBadge: {
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    display: "flex",
    gap: 4,
  },
  additions: {
    color: colors.success,
  },
  deletions: {
    color: colors.error,
  },
  diffToggle: {
    border: "none",
    background: "none",
    fontFamily: font.mono,
    fontSize: font.sizeXs,
    cursor: "pointer",
    padding: `2px ${spacing.xs}px`,
    borderRadius: radius.sm,
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
