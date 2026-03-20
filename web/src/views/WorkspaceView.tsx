import { useBridgeStore } from "../store";
import { filterProjects, DEFAULT_FILTER } from "../core/filter";
import AttentionBar, { computeAttentionItems } from "./workspace/AttentionBar";
import StatsBar from "./workspace/StatsBar";
import ProjectCard from "./workspace/ProjectCard";

export default function WorkspaceView() {
  const spec = useBridgeStore((s) => s.spec);
  const sessions = useBridgeStore((s) => s.sessions);

  if (!spec) {
    return <div style={styles.empty}>Loading workspace…</div>;
  }

  const projects = filterProjects(spec.projects, DEFAULT_FILTER);
  const attentionItems = computeAttentionItems(projects);

  const branchCount = projects.reduce((sum, p) => sum + (p.git?.branches.length ?? 0), 0);
  const prCount = projects.reduce((sum, p) => sum + p.prs.length, 0);
  const agentCount = Array.from(sessions.values()).filter((s) => s.state === "idle" || s.state === "streaming").length;

  return (
    <div style={styles.container}>
      <AttentionBar items={attentionItems} />
      <StatsBar
        projectCount={projects.length}
        branchCount={branchCount}
        prCount={prCount}
        agentCount={agentCount}
      />
      <div style={styles.grid}>
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    background: "#0d1117",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
    color: "#c9d1d9",
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#8b949e",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 12,
    padding: 16,
    overflowY: "auto",
    flex: 1,
  },
};
