import { useBridgeStore } from "../store";
import SessionSidebar from "./sessions/SessionSidebar";
import ChatArea from "./sessions/ChatArea";

export default function SessionsView() {
  const activeSessionId = useBridgeStore((s) => s.activeSessionId);
  const sessions = useBridgeStore((s) => s.sessions);
  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null;

  return (
    <div style={styles.container}>
      <SessionSidebar onNewSession={() => {}} />
      <div style={styles.main}>
        {!activeSession ? (
          <div style={styles.empty}>
            No active sessions. Create one to start.
          </div>
        ) : (
          <ChatArea session={activeSession} />
        )}
      </div>
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
