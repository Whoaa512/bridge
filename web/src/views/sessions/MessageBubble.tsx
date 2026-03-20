import Markdown from "react-markdown";
import type { ChatMessage } from "../../store";
import ToolCallBlock from "./ToolCallBlock";

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
    padding: "4px 16px",
  },
  userBubble: {
    maxWidth: "70%",
    padding: "8px 12px",
    borderRadius: 12,
    background: "#1f6feb",
    color: "#fff",
    fontSize: 14,
    lineHeight: 1.5,
    whiteSpace: "pre-wrap" as const,
  },
  assistantRow: {
    padding: "4px 16px",
  },
  assistantBubble: {
    maxWidth: "85%",
    color: "#c9d1d9",
    fontSize: 14,
    lineHeight: 1.6,
  },
  markdown: {
    overflowWrap: "break-word" as const,
  },
  thinking: {
    color: "#8b949e",
    fontStyle: "italic" as const,
  },
  cursor: {
    color: "#58a6ff",
    animation: "blink 1s step-end infinite",
  },
};
