const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    paddingTop: 40,
  },
  text: {
    color: "#8b949e",
    fontSize: 16,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
} as const;

export default function PlaceholderView({ message }: { message: string }) {
  return (
    <div style={styles.container}>
      <p style={styles.text}>{message}</p>
    </div>
  );
}
