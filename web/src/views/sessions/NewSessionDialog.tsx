import { useBridgeStore } from "../../store";
import { sendSessionCreate } from "../../agent/commands";
import type { Project } from "../../core/types";

interface Props {
  onClose: () => void;
}

export default function NewSessionDialog({ onClose }: Props) {
  const spec = useBridgeStore((s) => s.spec);
  const projects = spec?.projects ?? [];

  function handleSelect(project: Project) {
    sendSessionCreate(project.path, project.id);
    onClose();
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.title}>New Session</div>
        <div style={styles.subtitle}>Select a project</div>
        <div style={styles.list}>
          {projects.length === 0 && (
            <div style={styles.empty}>No projects found</div>
          )}
          {projects.map((p) => (
            <button key={p.id} onClick={() => handleSelect(p)} style={styles.item}>
              <div style={styles.name}>{p.name}</div>
              <div style={styles.path}>{p.path}</div>
            </button>
          ))}
        </div>
        <button onClick={onClose} style={styles.cancel}>Cancel</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed" as const,
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
  },
  dialog: {
    width: 420,
    maxHeight: "70vh",
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 12,
    padding: 16,
    display: "flex",
    flexDirection: "column" as const,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: "#c9d1d9",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: "#8b949e",
    marginBottom: 12,
  },
  list: {
    flex: 1,
    overflowY: "auto" as const,
    maxHeight: 400,
  },
  item: {
    display: "block",
    width: "100%",
    padding: "10px 12px",
    border: "none",
    borderRadius: 6,
    background: "transparent",
    color: "#c9d1d9",
    textAlign: "left" as const,
    cursor: "pointer",
    fontSize: 13,
    fontFamily: "inherit",
    marginBottom: 2,
  },
  name: {
    fontWeight: 600,
    marginBottom: 2,
  },
  path: {
    fontSize: 11,
    color: "#8b949e",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
  },
  empty: {
    padding: 20,
    textAlign: "center" as const,
    color: "#8b949e",
    fontSize: 13,
  },
  cancel: {
    marginTop: 12,
    padding: "8px 16px",
    border: "1px solid #30363d",
    borderRadius: 6,
    background: "transparent",
    color: "#8b949e",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
