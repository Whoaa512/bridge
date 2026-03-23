import { computeDiff, type DiffLine } from "./simple-diff";
import { colors, spacing, font, radius } from "../../ui/tokens";

interface Props {
  oldText: string;
  newText: string;
  filePath?: string;
}

const GUTTER_WIDTH = 36;

export default function SimpleDiff({ oldText, newText, filePath }: Props) {
  const lines = computeDiff(oldText, newText);

  return (
    <div style={styles.container}>
      {filePath && <div style={styles.fileHeader}>{filePath}</div>}
      <div style={styles.body}>
        {lines.map((line, i) => (
          <DiffRow key={i} line={line} />
        ))}
      </div>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const bg =
    line.type === "add"
      ? "rgba(63, 185, 80, 0.15)"
      : line.type === "remove"
        ? "rgba(248, 81, 73, 0.15)"
        : undefined;

  const textColor =
    line.type === "add"
      ? colors.success
      : line.type === "remove"
        ? colors.error
        : colors.text;

  const prefix =
    line.type === "add" ? "+" : line.type === "remove" ? "-" : " ";

  return (
    <div style={{ ...styles.row, background: bg }}>
      <span style={styles.gutter}>{line.oldNum ?? ""}</span>
      <span style={styles.gutter}>{line.newNum ?? ""}</span>
      <span style={{ ...styles.content, color: textColor }}>
        {prefix}
        {line.content}
      </span>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    border: `1px solid ${colors.border}`,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  fileHeader: {
    padding: `${spacing.xs}px ${spacing.sm}px`,
    background: colors.bgRaised,
    fontFamily: font.mono,
    fontSize: font.sizeSm,
    color: colors.textMuted,
    borderBottom: `1px solid ${colors.border}`,
  },
  body: {
    overflowX: "auto",
    fontFamily: font.mono,
    fontSize: font.sizeSm,
    lineHeight: 1.6,
  },
  row: {
    display: "flex",
    minWidth: "fit-content",
  },
  gutter: {
    width: GUTTER_WIDTH,
    minWidth: GUTTER_WIDTH,
    textAlign: "right" as const,
    paddingRight: spacing.xs,
    color: colors.textFaint,
    fontSize: font.sizeXs,
    userSelect: "none" as const,
    lineHeight: "inherit",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "flex-end",
  },
  content: {
    flex: 1,
    paddingLeft: spacing.xs,
    whiteSpace: "pre" as const,
  },
};
