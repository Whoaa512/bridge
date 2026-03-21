import { useState, useCallback, useEffect, useRef } from "react";
import { useBridgeStore } from "../../store";
import { sendProjectOptIn, sendProjectSearch } from "../../agent/commands";

interface ProjectSearchProps {
  onClose: () => void;
}

export default function ProjectSearch({ onClose }: ProjectSearchProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const results = useBridgeStore((s) => s.projectSearchResults);
  const focusedPaths = useBridgeStore((s) => s.focusedPaths);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelectedIndex(0);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      sendProjectSearch(query);
    }, 150);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const selectResult = useCallback((result: { name: string; path: string }) => {
    const store = useBridgeStore.getState();

    if (!store.focusedPaths.has(result.path)) {
      sendProjectOptIn(result.path);
    }

    if (store.activeView !== "sessions") {
      store.setActiveView("sessions");
    }

    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const result = results[selectedIndex];
      if (result) selectResult(result);
    }
  }, [results, selectedIndex, selectResult, onClose]);

  return (
    <div style={styles.backdrop} onMouseDown={onClose}>
      <div style={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search all repos…"
          style={styles.input}
        />
        <div ref={listRef} style={styles.list}>
          {results.length === 0 && query.trim() && (
            <div style={styles.empty}>No repos found</div>
          )}
          {results.length === 0 && !query.trim() && (
            <div style={styles.empty}>Type to search repos under your scan roots</div>
          )}
          {results.map((result, i) => {
            const isFocused = focusedPaths.has(result.path);
            return (
              <button
                key={result.path}
                onClick={() => selectResult(result)}
                style={{
                  ...styles.row,
                  ...(i === selectedIndex ? styles.rowSelected : {}),
                }}
              >
                <div style={styles.rowMain}>
                  <span style={styles.name}>{result.name}</span>
                  <span style={styles.path}>{result.path}</span>
                </div>
                <span style={isFocused ? styles.checkBadge : styles.addBadge}>
                  {isFocused ? "✓" : "Add"}
                </span>
              </button>
            );
          })}
        </div>
        <div style={styles.footer}>
          <kbd style={styles.kbd}>↑↓</kbd> navigate
          <kbd style={styles.kbd}>↵</kbd> add to focus
          <kbd style={styles.kbd}>esc</kbd> close
        </div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    paddingTop: 100,
    zIndex: 100,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  panel: {
    width: "100%",
    maxWidth: 500,
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 12,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column" as const,
  },
  input: {
    width: "100%",
    padding: "14px 16px",
    border: "none",
    borderBottom: "1px solid #30363d",
    background: "transparent",
    color: "#c9d1d9",
    fontSize: 16,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box" as const,
  },
  list: {
    maxHeight: 400,
    overflowY: "auto" as const,
    padding: "4px 0",
  },
  empty: {
    padding: "20px 16px",
    color: "#484f58",
    fontSize: 13,
    textAlign: "center" as const,
  },
  row: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "8px 16px",
    border: "none",
    background: "transparent",
    color: "#c9d1d9",
    cursor: "pointer",
    textAlign: "left" as const,
    fontFamily: "inherit",
    gap: 12,
  },
  rowSelected: {
    background: "#21262d",
  },
  rowMain: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    minWidth: 0,
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: 600,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  path: {
    fontSize: 11,
    color: "#8b949e",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  checkBadge: {
    fontSize: 12,
    color: "#3fb950",
    flexShrink: 0,
    opacity: 0.7,
  },
  addBadge: {
    fontSize: 11,
    color: "#8b949e",
    flexShrink: 0,
    padding: "2px 8px",
    borderRadius: 4,
    background: "#21262d",
  },
  footer: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 16px",
    borderTop: "1px solid #30363d",
    fontSize: 11,
    color: "#484f58",
  },
  kbd: {
    fontSize: 10,
    padding: "1px 5px",
    borderRadius: 3,
    background: "#21262d",
    color: "#8b949e",
    border: "1px solid #30363d",
    fontFamily: "inherit",
    marginRight: 2,
  },
};
