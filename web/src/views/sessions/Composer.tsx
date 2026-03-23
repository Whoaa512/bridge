import { useState, useRef, useCallback, useEffect } from "react";
import { useBridgeStore } from "../../store";
import { sendCommand } from "../../agent/commands";
import { colors, spacing, font, radius } from "../../ui/tokens";

export default function Composer() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const sessions = useBridgeStore((s) => s.sessions);

  const session = activeSessionId ? sessions.get(activeSessionId) : null;
  const isStreaming = session?.state === "streaming";

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeSessionId]);

  const send = useCallback((mode: "prompt" | "follow_up" | "steer") => {
    const trimmed = text.trim();
    if (!trimmed || !activeSessionId) return;

    useBridgeStore.getState().addMessage(activeSessionId, {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    });

    sendCommand(activeSessionId, { type: mode, message: trimmed });
    setText("");

    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    });
  }, [text, activeSessionId]);

  const abort = useCallback(() => {
    if (!activeSessionId) return;
    sendCommand(activeSessionId, { type: "abort" });
  }, [activeSessionId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (isStreaming) abort();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey && !e.metaKey) {
      e.preventDefault();
      send(isStreaming ? "follow_up" : "prompt");
      return;
    }

    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        send("steer");
      } else {
        setText((t) => t + "\n");
      }
    }
  }, [send, abort, isStreaming]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 300) + "px";
  }, []);

  return (
    <div style={styles.container}>
      {isStreaming && (
        <div style={styles.hint}>
          Enter to follow up · Shift+Enter to steer · Esc to abort
        </div>
      )}
      <div style={styles.row}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Follow up or steer…" : session?.model ? `Message ${session.model}…` : "Send a message…"}
          rows={1}
          style={{
            ...styles.textarea,
            ...(isStreaming ? { borderLeft: `2px solid ${colors.accent}` } : {}),
          }}
        />
        {isStreaming ? (
          <button onClick={abort} style={styles.abortBtn}>
            ■
          </button>
        ) : (
          <button
            onClick={() => send("prompt")}
            disabled={!text.trim()}
            style={{ ...styles.sendBtn, opacity: text.trim() ? 1 : 0.4 }}
          >
            ↑
          </button>
        )}
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: `${spacing.sm}px ${spacing.lg}px ${spacing.md}px`,
    borderTop: `1px solid ${colors.border}`,
    flexShrink: 0,
  },
  hint: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    textAlign: "center" as const,
  },
  row: {
    display: "flex",
    gap: spacing.sm,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    resize: "none" as const,
    padding: `${spacing.sm}px ${spacing.md}px`,
    border: `1px solid ${colors.border}`,
    borderRadius: radius.lg,
    background: colors.bgRaised,
    color: colors.text,
    fontSize: font.sizeXl,
    fontFamily: "inherit",
    lineHeight: 1.5,
    outline: "none",
    minHeight: 38,
    maxHeight: 300,
  },
  sendBtn: {
    width: 36,
    height: 36,
    border: "none",
    borderRadius: radius.lg,
    background: colors.accent,
    color: "#fff",
    fontSize: 18,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  abortBtn: {
    width: 36,
    height: 36,
    border: `1px solid ${colors.error}`,
    borderRadius: radius.lg,
    background: "transparent",
    color: colors.error,
    fontSize: font.sizeXl,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
