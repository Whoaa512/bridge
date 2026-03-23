import { useEffect, useRef, useCallback } from "react";
import { useBridgeStore } from "../../store";
import type { SessionInfo } from "../../agent/ws-types";
import MessageBubble from "./MessageBubble";
import { colors, spacing, font } from "../../ui/tokens";

interface Props {
  session: SessionInfo;
}

export default function ChatArea({ session }: Props) {
  const messages = useBridgeStore((s) => s.messages.get(session.id) ?? []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isNearBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.model}>{session.model}</span>
        <span style={{
          ...styles.badge,
          color: session.state === "streaming" ? colors.streaming : colors.textMuted,
        }}>
          {session.state}
        </span>
      </div>
      <div ref={scrollRef} style={styles.messages} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div style={styles.empty}>Send a message to start.</div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
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
  badge: {
    fontWeight: 500,
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: `${spacing.md}px 0`,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: colors.textMuted,
    fontSize: font.sizeXl,
  },
};
