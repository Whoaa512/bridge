import { useEffect, useCallback } from "react";
import { useBridgeStore, type View } from "./store";

const TABS: { view: View; label: string; key: string }[] = [
  { view: "complexity", label: "Complexity", key: "1" },
  { view: "workspace", label: "Workspace", key: "2" },
  { view: "colony", label: "Colony", key: "3" },
  { view: "sessions", label: "Sessions", key: "4" },
];

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export default function App() {
  const activeView = useBridgeStore((s) => s.activeView);
  const setActiveView = useBridgeStore((s) => s.setActiveView);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (isInputFocused()) return;
    const tab = TABS.find((t) => t.key === e.key);
    if (!tab) return;
    setActiveView(tab.view);
  }, [setActiveView]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <nav style={styles.bar}>
      {TABS.map((tab) => (
        <button
          key={tab.view}
          onClick={() => setActiveView(tab.view)}
          style={{
            ...styles.tab,
            ...(activeView === tab.view ? styles.active : {}),
          }}
        >
          <span style={styles.label}>{tab.label}</span>
          <kbd style={styles.kbd}>{tab.key}</kbd>
        </button>
      ))}
    </nav>
  );
}

const styles = {
  bar: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    height: 40,
    display: "flex",
    alignItems: "center",
    gap: 2,
    padding: "0 12px",
    background: "#0d1117",
    borderBottom: "1px solid #30363d",
    zIndex: 50,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  tab: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#8b949e",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "color 0.15s, background 0.15s",
  },
  active: {
    color: "#c9d1d9",
    background: "#21262d",
  },
  label: {},
  kbd: {
    fontSize: 10,
    padding: "1px 4px",
    borderRadius: 3,
    background: "#21262d",
    color: "#8b949e",
    border: "1px solid #30363d",
    fontFamily: "inherit",
  },
};
