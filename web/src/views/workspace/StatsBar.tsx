interface Props {
  projectCount: number;
  branchCount: number;
  prCount: number;
  agentCount: number;
}

export default function StatsBar({ projectCount, branchCount, prCount, agentCount }: Props) {
  const pills: { label: string; value: number }[] = [
    { label: "Projects", value: projectCount },
    { label: "Branches", value: branchCount },
    { label: "PRs", value: prCount },
    { label: "Active Agents", value: agentCount },
  ];

  return (
    <div style={styles.bar}>
      {pills.map((pill) => (
        <div key={pill.label} style={styles.pill}>
          <span style={styles.value}>{pill.value}</span>
          <span style={styles.label}>{pill.label}</span>
        </div>
      ))}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    display: "flex",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid #30363d",
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 6,
    background: "#21262d",
    fontSize: 13,
  },
  value: {
    color: "#c9d1d9",
    fontWeight: 600,
  },
  label: {
    color: "#8b949e",
  },
};
