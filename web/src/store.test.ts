import { describe, test, expect, beforeEach } from "bun:test";
import { useBridgeStore } from "./store";
import type { BridgeSpec } from "./core/types";
import type { ChatMessage, ToolCallInfo } from "./store";

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

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "msg-1",
    role: "assistant",
    content: "",
    timestamp: Date.now(),
    toolCalls: [],
    isStreaming: false,
    ...overrides,
  };
}

beforeEach(() => {
  useBridgeStore.setState({
    spec: null,
    activeView: "complexity",
    wsConnected: false,
    sessions: new Map(),
    messages: new Map(),
    activeSessionId: null,
    extensionUIRequest: null,
  });
});

describe("BridgeStore", () => {
  test("initial state", () => {
    const state = useBridgeStore.getState();
    expect(state.spec).toBeNull();
    expect(state.activeView).toBe("complexity");
    expect(state.wsConnected).toBe(false);
    expect(state.sessions.size).toBe(0);
    expect(state.messages.size).toBe(0);
    expect(state.activeSessionId).toBeNull();
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

describe("Chat Messages", () => {
  test("addMessage creates message list for new session", () => {
    const msg = makeMessage();
    useBridgeStore.getState().addMessage("s1", msg);

    const list = useBridgeStore.getState().messages.get("s1");
    expect(list).toHaveLength(1);
    expect(list![0]).toEqual(msg);
  });

  test("addMessage appends to existing session", () => {
    const store = useBridgeStore.getState();
    store.addMessage("s1", makeMessage({ id: "msg-1" }));
    store.addMessage("s1", makeMessage({ id: "msg-2", role: "user" }));

    const list = useBridgeStore.getState().messages.get("s1");
    expect(list).toHaveLength(2);
    expect(list![0].id).toBe("msg-1");
    expect(list![1].id).toBe("msg-2");
  });

  test("updateLastMessage updates the last message", () => {
    const store = useBridgeStore.getState();
    store.addMessage("s1", makeMessage({ id: "msg-1", content: "hello" }));
    store.addMessage("s1", makeMessage({ id: "msg-2", content: "world" }));

    useBridgeStore.getState().updateLastMessage("s1", (msg) => ({ ...msg, content: msg.content + " updated" }));

    const list = useBridgeStore.getState().messages.get("s1");
    expect(list![0].content).toBe("hello");
    expect(list![1].content).toBe("world updated");
  });

  test("updateLastMessage is no-op for empty or missing session", () => {
    useBridgeStore.getState().updateLastMessage("s1", (msg) => ({ ...msg, content: "nope" }));
    expect(useBridgeStore.getState().messages.size).toBe(0);
  });

  test("addToolCall adds tool to correct message", () => {
    const store = useBridgeStore.getState();
    store.addMessage("s1", makeMessage({ id: "msg-1" }));

    const tool: ToolCallInfo = { id: "tc-1", name: "bash", args: '{"command":"ls"}' };
    useBridgeStore.getState().addToolCall("s1", "msg-1", tool);

    const list = useBridgeStore.getState().messages.get("s1");
    expect(list![0].toolCalls).toHaveLength(1);
    expect(list![0].toolCalls![0]).toEqual(tool);
  });

  test("addToolCall is no-op for unknown session", () => {
    useBridgeStore.getState().addToolCall("nope", "msg-1", { id: "tc-1", name: "bash", args: "{}" });
    expect(useBridgeStore.getState().messages.size).toBe(0);
  });

  test("updateToolCall updates specific tool call", () => {
    const store = useBridgeStore.getState();
    store.addMessage("s1", makeMessage({ id: "msg-1", toolCalls: [{ id: "tc-1", name: "bash", args: "{}" }] }));

    useBridgeStore.getState().updateToolCall("s1", "msg-1", "tc-1", { result: "done", isError: false });

    const tc = useBridgeStore.getState().messages.get("s1")![0].toolCalls![0];
    expect(tc.result).toBe("done");
    expect(tc.isError).toBe(false);
  });

  test("updateToolCall is no-op for unknown session", () => {
    useBridgeStore.getState().updateToolCall("nope", "msg-1", "tc-1", { result: "x" });
    expect(useBridgeStore.getState().messages.size).toBe(0);
  });

  test("clearMessages removes all messages for session", () => {
    const store = useBridgeStore.getState();
    store.addMessage("s1", makeMessage());
    store.addMessage("s2", makeMessage());

    useBridgeStore.getState().clearMessages("s1");

    expect(useBridgeStore.getState().messages.has("s1")).toBe(false);
    expect(useBridgeStore.getState().messages.has("s2")).toBe(true);
  });

  test("removeSession also clears messages and resets activeSessionId", () => {
    const store = useBridgeStore.getState();
    store.addSession({ id: "s1", cwd: "/tmp", projectId: "p1", model: "claude", state: "idle" });
    store.addMessage("s1", makeMessage());
    store.setActiveSessionId("s1");

    useBridgeStore.getState().removeSession("s1");

    expect(useBridgeStore.getState().messages.has("s1")).toBe(false);
    expect(useBridgeStore.getState().activeSessionId).toBeNull();
  });

  test("removeSession does not clear activeSessionId for different session", () => {
    const store = useBridgeStore.getState();
    store.addSession({ id: "s1", cwd: "/tmp", projectId: "p1", model: "claude", state: "idle" });
    store.addSession({ id: "s2", cwd: "/tmp", projectId: "p2", model: "claude", state: "idle" });
    store.setActiveSessionId("s2");

    useBridgeStore.getState().removeSession("s1");

    expect(useBridgeStore.getState().activeSessionId).toBe("s2");
  });

  test("setActiveSessionId sets active session", () => {
    useBridgeStore.getState().setActiveSessionId("s1");
    expect(useBridgeStore.getState().activeSessionId).toBe("s1");

    useBridgeStore.getState().setActiveSessionId(null);
    expect(useBridgeStore.getState().activeSessionId).toBeNull();
  });
});

describe("Extension UI Request", () => {
  test("setExtensionUIRequest stores and clears request", () => {
    const req = {
      sessionId: "s1",
      request: { type: "extension_ui_request" as const, id: "r1", method: "confirm" as const, title: "Test", message: "ok?" },
    };
    useBridgeStore.getState().setExtensionUIRequest(req);
    expect(useBridgeStore.getState().extensionUIRequest).toEqual(req);

    useBridgeStore.getState().setExtensionUIRequest(null);
    expect(useBridgeStore.getState().extensionUIRequest).toBeNull();
  });
});
