import { useEffect, useRef, useCallback } from "react";
import { useBridgeStore } from "../../store";
import type { SessionInfo } from "../../agent/ws-types";
import MessageBubble from "./MessageBubble";

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
          color: session.state === "streaming" ? "#58a6ff" : "#8b949e",
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
    gap: 8,
    padding: "8px 16px",
    borderBottom: "1px solid #30363d",
    fontSize: 12,
    color: "#8b949e",
    flexShrink: 0,
  },
  model: {
    fontFamily: "'SF Mono', 'Fira Code', monospace",
  },
  badge: {
    fontWeight: 500,
  },
  messages: {
    flex: 1,
    overflowY: "auto" as const,
    padding: "12px 0",
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    color: "#8b949e",
    fontSize: 14,
  },
};
