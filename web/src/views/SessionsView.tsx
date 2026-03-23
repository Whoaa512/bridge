import { useEffect, useCallback } from "react";
import { useBridgeStore } from "../store";
import { sendCommand } from "../agent/commands";
import SessionSidebar from "./sessions/SessionSidebar";
import ChatArea from "./sessions/ChatArea";
import Composer from "./sessions/Composer";
import ExtensionDialog from "./sessions/ExtensionDialog";
import ErrorBoundary from "../ui/ErrorBoundary";
import { colors, font, spacing } from "../ui/tokens";

function EmptyState() {
  return (
    <div style={styles.empty}>
      <div style={styles.emptyContent}>
        <div style={styles.emptyIcon}>⌘</div>
        <p style={styles.emptyTitle}>No active session</p>
        <p style={styles.emptyHint}>
          Click <strong>+</strong> on a project to start a session,
          or select an existing one from the sidebar.
        </p>
      </div>
    </div>
  );
}

export default function SessionsView() {
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const sessions = useBridgeStore((s) => s.sessions);

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  useEffect(() => {
    if (!activeSessionId) return;
    const session = sessions.get(activeSessionId);
    if (session) return;
    useBridgeStore.getState().setActiveSessionId(null);
  }, [sessions, activeSessionId]);

  useEffect(() => {
    if (activeSessionId) return;
    const first = sessions.values().next();
    if (first.done) return;
    useBridgeStore.getState().setActiveSessionId(first.value.id);
  }, [sessions, activeSessionId]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    const tag = document.activeElement?.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;

    const { activeSessionId: sid, sessions: sess } = useBridgeStore.getState();
    if (!sid) return;
    const session = sess.get(sid);
    if (session?.state !== "streaming") return;

    e.preventDefault();
    sendCommand(sid, { type: "abort" });
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div style={styles.container}>
      <SessionSidebar />
      <div style={styles.main}>
        {!activeSession ? (
          <EmptyState />
        ) : (
          <ErrorBoundary>
            <ChatArea session={activeSession} />
            <Composer />
          </ErrorBoundary>
        )}
      </div>
      <ExtensionDialog />
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    height: "100%",
    background: colors.bg,
    fontFamily: font.sans,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column" as const,
    minWidth: 0,
  },
  empty: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
  },
  emptyContent: {
    textAlign: "center" as const,
    maxWidth: 320,
  },
  emptyIcon: {
    fontSize: 32,
    color: colors.border,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: colors.textMuted,
    margin: `0 0 ${spacing.sm}px`,
  },
  emptyHint: {
    fontSize: font.sizeLg,
    color: colors.textFaint,
    lineHeight: 1.5,
    margin: 0,
  },
};
