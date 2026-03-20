import { describe, test, expect, beforeEach } from "bun:test";
import { useBridgeStore } from "./store";
import type { BridgeSpec } from "./core/types";

function makeSpec(): BridgeSpec {
  return {
    version: "1.0",
    scannedAt: new Date().toISOString(),
    machine: { hostname: "test", os: "test", uptime: 0 },
    projects: [],
    infrastructure: { ports: [], docker: [], resources: { cpuByProject: {}, memByProject: {} } },
    alerts: [],
    cycle: {
      period: "weekly",
      start: new Date().toISOString(),
      end: new Date().toISOString(),
      summary: { commitsTotal: 0, projectsActive: 0, prsOpened: 0, prsMerged: 0, alertsNew: 0, alertsResolved: 0 },
    },
  };
}

beforeEach(() => {
  useBridgeStore.setState({
    spec: null,
    activeView: "complexity",
    wsConnected: false,
    sessions: new Map(),
  });
});

describe("BridgeStore", () => {
  test("initial state", () => {
    const state = useBridgeStore.getState();
    expect(state.spec).toBeNull();
    expect(state.activeView).toBe("complexity");
    expect(state.wsConnected).toBe(false);
    expect(state.sessions.size).toBe(0);
  });

  test("setSpec updates spec", () => {
    const spec = makeSpec();
    useBridgeStore.getState().setSpec(spec);
    expect(useBridgeStore.getState().spec).toBe(spec);
  });

  test("setActiveView switches view", () => {
    useBridgeStore.getState().setActiveView("workspace");
    expect(useBridgeStore.getState().activeView).toBe("workspace");

    useBridgeStore.getState().setActiveView("colony");
    expect(useBridgeStore.getState().activeView).toBe("colony");

    useBridgeStore.getState().setActiveView("sessions");
    expect(useBridgeStore.getState().activeView).toBe("sessions");

    useBridgeStore.getState().setActiveView("complexity");
    expect(useBridgeStore.getState().activeView).toBe("complexity");
  });

  test("setWsConnected toggles ws state", () => {
    useBridgeStore.getState().setWsConnected(true);
    expect(useBridgeStore.getState().wsConnected).toBe(true);

    useBridgeStore.getState().setWsConnected(false);
    expect(useBridgeStore.getState().wsConnected).toBe(false);
  });

  test("addSession adds to sessions map", () => {
    const session = { id: "s1", cwd: "/tmp", projectId: "p1", model: "claude", state: "idle" as const };
    useBridgeStore.getState().addSession(session);

    const sessions = useBridgeStore.getState().sessions;
    expect(sessions.size).toBe(1);
    expect(sessions.get("s1")).toEqual(session);
  });

  test("removeSession removes from sessions map", () => {
    const session = { id: "s1", cwd: "/tmp", projectId: "p1", model: "claude", state: "idle" as const };
    useBridgeStore.getState().addSession(session);
    useBridgeStore.getState().removeSession("s1");

    expect(useBridgeStore.getState().sessions.size).toBe(0);
  });

  test("removeSession is a no-op for unknown id", () => {
    useBridgeStore.getState().removeSession("nonexistent");
    expect(useBridgeStore.getState().sessions.size).toBe(0);
  });

  test("updateSessionState changes session state", () => {
    const session = { id: "s1", cwd: "/tmp", projectId: "p1", model: "claude", state: "idle" as const };
    useBridgeStore.getState().addSession(session);
    useBridgeStore.getState().updateSessionState("s1", "streaming");

    expect(useBridgeStore.getState().sessions.get("s1")?.state).toBe("streaming");
  });

  test("updateSessionState is a no-op for unknown id", () => {
    useBridgeStore.getState().updateSessionState("nonexistent", "streaming");
    expect(useBridgeStore.getState().sessions.size).toBe(0);
  });

  test("setSessions replaces all sessions", () => {
    useBridgeStore.getState().addSession({ id: "old", cwd: "/tmp", projectId: "p", model: "m", state: "idle" });

    const newSessions = [
      { id: "s1", cwd: "/a", projectId: "p1", model: "m1", state: "idle" as const },
      { id: "s2", cwd: "/b", projectId: "p2", model: "m2", state: "streaming" as const },
    ];
    useBridgeStore.getState().setSessions(newSessions);

    const sessions = useBridgeStore.getState().sessions;
    expect(sessions.size).toBe(2);
    expect(sessions.has("old")).toBe(false);
    expect(sessions.get("s1")?.cwd).toBe("/a");
    expect(sessions.get("s2")?.state).toBe("streaming");
  });
});
