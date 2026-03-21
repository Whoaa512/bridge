interface Props {
  projectCount: number;
  uncommittedCount: number;
  prCount: number;
  agentCount: number;
}

export default function StatsBar({ projectCount, uncommittedCount, prCount, agentCount }: Props) {
  const pills: { label: string; value: number }[] = [
    { label: "Projects", value: projectCount },
    { label: "Uncommitted", value: uncommittedCount },
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
    flex: 1,
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
