import { useEffect, useRef, useCallback, useState } from "react";
import { useBridgeStore } from "../../store";
import type { SessionInfo } from "../../agent/ws-types";
import MessageBubble from "./MessageBubble";
import ErrorBanner from "./ErrorBanner";
import { formatDuration } from "./format-duration";
import { colors, spacing, font, radius } from "../../ui/tokens";

interface Props {
  session: SessionInfo;
  projectName?: string;
}

const pulseAnimation = "bridge-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }";

export default function ChatArea({ session, projectName }: Props) {
  const messages = useBridgeStore((s) => s.messages.get(session.id) ?? []);
  const sessionError = useBridgeStore((s) => s.sessionErrors.get(session.id));
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const prevCountRef = useRef(messages.length);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsNearBottom(nearBottom);
    if (nearBottom) setHasNewBelow(false);
  }, []);

  useEffect(() => {
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;

    const el = scrollRef.current;
    if (!el) return;

    if (!isNearBottom && grew) {
      setHasNewBelow(true);
      return;
    }

    if (isNearBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isNearBottom]);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setHasNewBelow(false);
  }, []);

  const isPulsing = session.state === "streaming" || session.state === "compacting";
  const dotColor = session.state === "streaming" ? colors.streaming
    : session.state === "compacting" ? colors.warning
    : colors.textMuted;
  const stateLabel = session.state === "streaming" ? "Working…"
    : session.state === "compacting" ? "Compacting…"
    : null;

  return (
    <div style={styles.container}>
      {isPulsing && (
        <style>{`@keyframes ${pulseAnimation}`}</style>
      )}
      <div style={styles.header}>
        {projectName && <span style={styles.projectName}>{projectName}</span>}
        <span style={styles.model}>{session.model}</span>
        <span style={styles.statusGroup}>
          <span style={{
            ...styles.dot,
            background: dotColor,
            ...(isPulsing ? { animation: "bridge-pulse 1.5s ease-in-out infinite" } : {}),
          }} />
          {stateLabel && <span style={{ color: dotColor, fontWeight: 500 }}>{stateLabel}</span>}
        </span>
      </div>
      {sessionError && (
        <ErrorBanner
          message={sessionError}
          onDismiss={() => useBridgeStore.getState().setSessionError(session.id, null)}
        />
      )}
      <div style={styles.messagesWrapper}>
        <div ref={scrollRef} style={styles.messages} onScroll={handleScroll}>
          {messages.length === 0 ? (
            <div style={styles.empty}>Send a message to start.</div>
          ) : (
            messages.map((msg, i) => {
              const prev = i > 0 ? messages[i - 1] : null;
              const showDivider = prev
                && prev.role === "assistant"
                && prev.completedAt
                && msg.role === "user";
              const elapsed = showDivider
                ? msg.timestamp - prev!.completedAt!
                : 0;
              return (
                <div key={msg.id}>
                  {showDivider && (
                    <div style={styles.divider}>
                      <div style={styles.dividerLine} />
                      <span style={styles.dividerBadge}>{formatDuration(elapsed)}</span>
                    </div>
                  )}
                  <MessageBubble message={msg} />
                </div>
              );
            })
          )}
        </div>
        {!isNearBottom && (
          <div style={styles.pill} onClick={scrollToBottom}>
            {hasNewBelow ? "↓ New messages" : "↓"}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    flexDirection: "column" as const,
    flex: 1,
    minHeight: 0,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: spacing.sm,
    padding: `${spacing.sm}px ${spacing.lg}px`,
    borderBottom: `1px solid ${colors.border}`,
    fontSize: font.sizeMd,
    color: colors.textMuted,
    flexShrink: 0,
  },
  model: {
    fontFamily: font.mono,
  },
  projectName: {
    fontWeight: 600,
    color: colors.text,
  },
  statusGroup: {
    display: "flex",
    alignItems: "center",
    gap: spacing.xs,
    marginLeft: "auto",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
  messagesWrapper: {
    position: "relative" as const,
    flex: 1,
    minHeight: 0,
  },
  messages: {
    height: "100%",
    overflowY: "auto" as const,
    padding: `${spacing.md}px 0`,
  },
  pill: {
    position: "absolute" as const,
    bottom: spacing.lg,
    left: "50%",
    transform: "translateX(-50%)",
    padding: `${spacing.xs}px ${spacing.md}px`,
    background: colors.accent,
    color: "#fff",
    fontSize: font.sizeSm,
    borderRadius: radius.xl,
    cursor: "pointer",
    boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
    whiteSpace: "nowrap" as const,
    userSelect: "none" as const,
    zIndex: 1,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: colors.textMuted,
    fontSize: font.sizeXl,
  },
  divider: {
    position: "relative" as const,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: `${spacing.md}px ${spacing.lg}px`,
  },
  dividerLine: {
    position: "absolute" as const,
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    background: colors.border,
  },
  dividerBadge: {
    position: "relative" as const,
    padding: `2px ${spacing.sm}px`,
    fontSize: font.sizeXs,
    color: colors.textFaint,
    background: colors.bgRaised,
    borderRadius: radius.sm,
  },
};
