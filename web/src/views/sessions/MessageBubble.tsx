import Markdown from "react-markdown";
import type { ChatMessage } from "../../store";
import ToolCallBlock from "./ToolCallBlock";
import { colors, spacing, font, radius } from "../../ui/tokens";

interface Props {
  message: ChatMessage;
}

export default function MessageBubble({ message }: Props) {
  if (message.role === "user") {
    return (
      <div style={styles.userRow}>
        <div style={styles.userBubble}>
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div style={styles.assistantRow}>
      <div style={styles.assistantBubble}>
        {message.content && (
          <div className="bridge-markdown" style={styles.markdown}>
            <Markdown>{message.content}</Markdown>
          </div>
        )}
        {message.toolCalls?.map((tc) => (
          <ToolCallBlock key={tc.id} tool={tc} />
        ))}
        {message.isStreaming && !message.content && !message.toolCalls?.length && (
          <span style={styles.thinking}>Thinking…</span>
        )}
        {message.isStreaming && message.content && (
          <span style={styles.cursor}>▊</span>
        )}
      </div>
    </div>
  );
}

const styles = {
  userRow: {
    display: "flex",
    justifyContent: "flex-end",
    padding: `${spacing.xs}px ${spacing.lg}px`,
  },
  userBubble: {
    maxWidth: "70%",
    padding: `${spacing.sm}px ${spacing.md}px`,
    borderRadius: radius.xl,
    background: colors.userBubble,
    color: "#fff",
    fontSize: font.sizeXl,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
  },
  assistantRow: {
    padding: `${spacing.xs}px ${spacing.lg}px`,
  },
  assistantBubble: {
    maxWidth: "85%",
    color: colors.text,
    fontSize: font.sizeXl,
    lineHeight: 1.6,
  },
  markdown: {
    overflowWrap: "break-word" as const,
  },
  thinking: {
    color: colors.textMuted,
    fontStyle: "italic" as const,
  },
  cursor: {
    color: colors.streaming,
    animation: "blink 1s step-end infinite",
  },
};
