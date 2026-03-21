import { type WorkspaceFilter, type WorkspaceSort, isPillFilter, filterLabel } from "./filter-utils";

const PILLS: { filter: WorkspaceFilter; label: string }[] = [
  { filter: "all", label: "All" },
  { filter: "has_prs", label: "Has PRs" },
  { filter: "active_agents", label: "Active Agents" },
  { filter: "stale", label: "Stale" },
];

interface Props {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeFilter: WorkspaceFilter;
  onFilterChange: (filter: WorkspaceFilter) => void;
  activeSort: WorkspaceSort;
  onSortChange: (sort: WorkspaceSort) => void;
}

export default function SearchFilter({ searchQuery, onSearchChange, activeFilter, onFilterChange, activeSort, onSortChange }: Props) {
  const showChip = !isPillFilter(activeFilter);

  return (
    <div style={styles.row}>
      <input
        type="text"
        placeholder="Search projects…"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        style={styles.input}
      />
      <div style={styles.pills}>
        {PILLS.map(({ filter, label }) => (
          <button
            key={filter}
            onClick={() => onFilterChange(filter)}
            style={filter === activeFilter ? styles.pillActive : styles.pill}
          >
            {label}
          </button>
        ))}
        {showChip && (
          <button onClick={() => onFilterChange("all")} style={styles.chip}>
            × {filterLabel(activeFilter)}
          </button>
        )}
      </div>
      <select
        value={activeSort}
        onChange={(e) => onSortChange(e.target.value as WorkspaceSort)}
        style={styles.select}
      >
        <option value="activity">Sort: Activity</option>
        <option value="name">Sort: Name</option>
        <option value="uncommitted">Sort: Uncommitted</option>
      </select>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 16px",
  },
  input: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 6,
    color: "#c9d1d9",
    padding: "6px 12px",
    fontSize: 14,
    outline: "none",
    width: 240,
    fontFamily: "inherit",
  },
  pills: {
    display: "flex",
    gap: 6,
  },
  pill: {
    background: "transparent",
    border: "1px solid #30363d",
    borderRadius: 20,
    color: "#8b949e",
    padding: "4px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pillActive: {
    background: "#21262d",
    border: "1px solid #30363d",
    borderRadius: 20,
    color: "#c9d1d9",
    padding: "4px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  chip: {
    background: "rgba(88, 166, 255, 0.15)",
    border: "1px solid #58a6ff4d",
    borderRadius: 20,
    color: "#58a6ff",
    padding: "4px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  select: {
    background: "#161b22",
    border: "1px solid #30363d",
    borderRadius: 20,
    color: "#8b949e",
    padding: "4px 14px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
    outline: "none",
    marginLeft: "auto",
  },
};
