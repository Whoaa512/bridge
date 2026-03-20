import { useState, useEffect } from "react";
import { useBridgeStore } from "../store";
import SessionSidebar from "./sessions/SessionSidebar";
import ChatArea from "./sessions/ChatArea";
import Composer from "./sessions/Composer";
import NewSessionDialog from "./sessions/NewSessionDialog";

export default function SessionsView() {
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const sessions = useBridgeStore((s) => s.sessions);
  const [showNewDialog, setShowNewDialog] = useState(false);

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

  return (
    <div style={styles.container}>
      <SessionSidebar onNewSession={() => setShowNewDialog(true)} />
      <div style={styles.main}>
        {!activeSession ? (
          <div style={styles.empty}>
            No active sessions. Create one to start.
          </div>
        ) : (
          <>
            <ChatArea session={activeSession} />
            <Composer />
          </>
        )}
      </div>
      {showNewDialog && (
        <NewSessionDialog onClose={() => setShowNewDialog(false)} />
      )}
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    height: "100%",
    background: "#0d1117",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
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
    color: "#8b949e",
    fontSize: 14,
  },
};
