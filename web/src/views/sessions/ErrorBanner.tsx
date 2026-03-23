import { colors, spacing, font } from "../../ui/tokens";

interface Props {
  message: string;
  onDismiss: () => void;
}

export default function ErrorBanner({ message, onDismiss }: Props) {
  return (
    <div style={styles.banner}>
      <span style={styles.message}>{message}</span>
      <button style={styles.dismiss} onClick={onDismiss}>✕</button>
    </div>
  );
}

const styles = {
  banner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${spacing.sm}px ${spacing.lg}px`,
    background: `${colors.error}26`,
    color: colors.error,
    borderLeft: `3px solid ${colors.error}`,
    fontSize: font.sizeLg,
    flexShrink: 0,
  },
  message: {
    flex: 1,
  },
  dismiss: {
    background: "none",
    border: "none",
    color: colors.error,
    cursor: "pointer",
    fontSize: font.sizeLg,
    padding: spacing.xs,
    lineHeight: 1,
  },
};
