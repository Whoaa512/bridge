import { useState, useRef, useCallback } from "react";
import { useBridgeStore } from "../../store";
import { sendCommand } from "../../agent/commands";

export default function Composer() {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const sessions = useBridgeStore((s) => s.sessions);

  const session = activeSessionId ? sessions.get(activeSessionId) : null;
  const isStreaming = session?.state === "streaming";

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
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
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
          placeholder={isStreaming ? "Follow up or steer…" : "Send a message…"}
          rows={1}
          style={styles.textarea}
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
    padding: "8px 16px 12px",
    borderTop: "1px solid #30363d",
    flexShrink: 0,
  },
  hint: {
    fontSize: 11,
    color: "#8b949e",
    marginBottom: 4,
    textAlign: "center" as const,
  },
  row: {
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
  },
  textarea: {
    flex: 1,
    resize: "none" as const,
    padding: "8px 12px",
    border: "1px solid #30363d",
    borderRadius: 8,
    background: "#161b22",
    color: "#c9d1d9",
    fontSize: 14,
    fontFamily: "inherit",
    lineHeight: 1.5,
    outline: "none",
    minHeight: 38,
    maxHeight: 200,
  },
  sendBtn: {
    width: 36,
    height: 36,
    border: "none",
    borderRadius: 8,
    background: "#1f6feb",
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
    border: "1px solid #f85149",
    borderRadius: 8,
    background: "transparent",
    color: "#f85149",
    fontSize: 14,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
};
