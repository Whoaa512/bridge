import { useState } from "react";
import type { ToolCallInfo } from "../../store";

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
    margin: "4px 0",
    border: "1px solid #30363d",
    borderRadius: 6,
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "6px 10px",
    border: "none",
    background: "#161b22",
    color: "#8b949e",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
    textAlign: "left" as const,
  },
  chevron: {
    fontSize: 10,
    width: 12,
    flexShrink: 0,
  },
  name: {
    color: "#d2a8ff",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    flex: 1,
  },
  running: {
    color: "#58a6ff",
    animation: "spin 1s linear infinite",
  },
  error: {
    color: "#f85149",
  },
  success: {
    color: "#3fb950",
  },
  body: {
    padding: 8,
    background: "#0d1117",
    borderTop: "1px solid #30363d",
  },
  pre: {
    margin: 0,
    padding: 8,
    fontSize: 11,
    lineHeight: 1.5,
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    color: "#c9d1d9",
    whiteSpace: "pre-wrap" as const,
    wordBreak: "break-word" as const,
    maxHeight: 300,
    overflow: "auto",
  },
  errorText: {
    color: "#f85149",
  },
};
