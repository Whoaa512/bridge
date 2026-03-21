import { useEffect, useRef, useCallback } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const adjustedPosition = useCallback(() => {
    const margin = 8;
    const menuW = 180;
    const menuH = items.length * 32 + 8;
    const adjX = x + menuW > window.innerWidth - margin ? x - menuW : x;
    const adjY = y + menuH > window.innerHeight - margin ? y - menuH : y;
    return { left: Math.max(margin, adjX), top: Math.max(margin, adjY) };
  }, [x, y, items.length]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const pos = adjustedPosition();

  return (
    <div ref={ref} style={{ ...styles.menu, left: pos.left, top: pos.top }}>
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.onClick(); onClose(); }}
          style={item.danger ? { ...styles.item, color: "#f85149" } : styles.item}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "#30363d"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  menu: {
    position: "fixed",
    zIndex: 1000,
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 6,
    padding: "4px 0",
    minWidth: 160,
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  item: {
    display: "block",
    width: "100%",
    padding: "6px 12px",
    border: "none",
    background: "transparent",
    color: "#c9d1d9",
    fontSize: 13,
    textAlign: "left" as const,
    cursor: "pointer",
    fontFamily: "inherit",
    borderRadius: 0,
  },
};
