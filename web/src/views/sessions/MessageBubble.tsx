import { useState } from "react";
import Markdown from "react-markdown";
import type { ChatMessage } from "../../store";
import { deriveWorkLog } from "./work-log";
import WorkLogBlock from "./WorkLogBlock";
import { formatDuration } from "./format-duration";
import { MarkdownCode } from "./MarkdownCode";
import { colors, spacing, font, radius } from "../../ui/tokens";

interface Props {
  message: ChatMessage;
}

function ThinkingDots() {
  return (
    <span style={styles.dotsContainer}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            ...styles.dot,
            animationDelay: `${i * 0.3}s`,
          }}
        >
          ·
        </span>
      ))}
      <style>{`@keyframes bridge-dot-pulse { 0%,100% { opacity: 0.2 } 50% { opacity: 1 } }`}</style>
    </span>
  );
}

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button style={styles.copyButton} onClick={handleCopy}>
      {copied ? "✓" : "Copy"}
    </button>
  );
}

export default function MessageBubble({ message }: Props) {
  const [hovered, setHovered] = useState(false);

  if (message.role === "user") {
    return (
      <div style={styles.userRow}>
        <div style={styles.userBubble}>
          {message.content}
        </div>
      </div>
    );
  }

  const duration = message.completedAt && message.startedAt
    ? message.completedAt - message.startedAt
    : null;

  return (
    <div style={styles.assistantRow}>
      <div
        style={styles.assistantBubble}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {hovered && message.content && !message.isStreaming && (
          <CopyButton content={message.content} />
        )}
        {message.content && (
          <div className="bridge-markdown" style={styles.markdown}>
            <Markdown components={{ code: MarkdownCode }}>{message.content}</Markdown>
          </div>
        )}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <WorkLogBlock groups={deriveWorkLog(message.toolCalls)} />
        )}
        {message.isStreaming && !message.content && !message.toolCalls?.length && (
          <ThinkingDots />
        )}
        {message.isStreaming && message.content && (
          <span style={styles.cursor}>▊</span>
        )}
        {!message.isStreaming && duration !== null && (
          <div style={styles.duration}>{formatDuration(duration)}</div>
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
    position: "relative" as const,
    maxWidth: "85%",
    color: colors.text,
    fontSize: font.sizeXl,
    lineHeight: 1.6,
  },
  markdown: {
    overflowWrap: "break-word" as const,
  },
  dotsContainer: {
    display: "inline-flex",
    gap: spacing.xs,
    color: colors.textMuted,
    fontSize: font.sizeLg,
  },
  dot: {
    animation: "bridge-dot-pulse 1.2s ease-in-out infinite",
  },
  copyButton: {
    position: "absolute" as const,
    top: 0,
    right: 0,
    background: colors.bgOverlay,
    color: colors.textMuted,
    border: "none",
    borderRadius: radius.sm,
    fontSize: font.sizeXs,
    padding: `2px ${spacing.xs}px`,
    cursor: "pointer",
    zIndex: 1,
  },
  cursor: {
    color: colors.streaming,
    animation: "blink 1s step-end infinite",
  },
  duration: {
    textAlign: "right" as const,
    fontSize: font.sizeSm,
    color: colors.textFaint,
    marginTop: spacing.xs,
  },
};
