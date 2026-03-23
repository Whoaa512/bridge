import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;

    if (this.props.fallback) return this.props.fallback;

    return (
      <div style={styles.container}>
        <div style={styles.title}>Something went wrong</div>
        <pre style={styles.error}>{this.state.error.message}</pre>
        <button onClick={() => this.setState({ error: null })} style={styles.btn}>
          Retry
        </button>
      </div>
    );
  }
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    gap: 12,
    padding: 24,
  },
  title: {
    fontSize: 16,
    fontWeight: 600,
    color: "#f85149",
  },
  error: {
    fontSize: 12,
    color: "#8b949e",
    fontFamily: "'SF Mono', 'Fira Code', monospace",
    maxWidth: 500,
    overflow: "auto",
    whiteSpace: "pre-wrap" as const,
  },
  btn: {
    padding: "8px 16px",
    border: "1px solid #30363d",
    borderRadius: 6,
    background: "#21262d",
    color: "#c9d1d9",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
};
