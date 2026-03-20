import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { connectWS, type WSCallbacks } from "./ws";

type WSHandler = ((event: any) => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static OPEN = 1;

  url: string;
  onopen: WSHandler = null;
  onclose: WSHandler = null;
  onmessage: WSHandler = null;
  onerror: WSHandler = null;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({});
  }

  send = mock((_data: string) => {});

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.({});
  }

  simulateMessage(data: any) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

let origWS: any;
let origLocation: any;

beforeEach(() => {
  MockWebSocket.instances = [];
  origWS = (globalThis as any).WebSocket;
  (globalThis as any).WebSocket = MockWebSocket;
  origLocation = (globalThis as any).location;
  (globalThis as any).location = { protocol: "http:", host: "localhost:7400" };
});

afterEach(() => {
  (globalThis as any).WebSocket = origWS;
  (globalThis as any).location = origLocation;
});

function makeCallbacks() {
  return {
    onSpec: mock(() => {}),
    onDisconnect: mock(() => {}),
    onReconnect: mock(() => {}),
    onSessionCreated: mock(() => {}),
    onSessionDestroyed: mock(() => {}),
    onSessionError: mock(() => {}),
    onSessionsList: mock(() => {}),
    onPiEvent: mock(() => {}),
    onPiResponse: mock(() => {}),
    onExtensionUIRequest: mock(() => {}),
  } as unknown as WSCallbacks & {
    [K in keyof WSCallbacks]: WSCallbacks[K] & { mock: { calls: any[][] } };
  };
}

describe("connectWS", () => {
  test("calls onSpec on full_sync message", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const fakeSpec = { version: "1.0", projects: [] };
    ws.simulateMessage({ type: "full_sync", spec: fakeSpec });

    expect(cb.onSpec).toHaveBeenCalledTimes(1);
    const callArgs = (cb.onSpec.mock.calls[0] as any[])[0];
    expect(callArgs).toEqual(fakeSpec);

    handle.close();
  });

  test("ignores non full_sync messages", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({ type: "project_update", id: "test" });

    expect(cb.onSpec).toHaveBeenCalledTimes(0);

    handle.close();
  });

  test("calls onDisconnect on close and attempts reconnect", async () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateClose();

    expect(cb.onDisconnect).toHaveBeenCalledTimes(1);

    await new Promise((r) => setTimeout(r, 1200));

    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);

    handle.close();
  });

  test("calls onReconnect on successful reconnection", async () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);

    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();
    ws1.simulateClose();

    await new Promise((r) => setTimeout(r, 1200));

    const ws2 = MockWebSocket.instances[1];
    expect(ws2).toBeDefined();
    ws2.simulateOpen();

    expect(cb.onReconnect).toHaveBeenCalledTimes(1);

    handle.close();
  });

  test("close() cancels pending reconnect", async () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);

    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    ws.simulateClose();

    handle.close();

    await new Promise((r) => setTimeout(r, 1500));

    expect(MockWebSocket.instances.length).toBe(1);
  });

  test("routes session_created to onSessionCreated", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const session = { id: "s1", cwd: "/tmp", projectId: "p1", model: "claude", state: "idle" as const };
    ws.simulateMessage({ type: "session_created", session });

    expect(cb.onSessionCreated).toHaveBeenCalledTimes(1);
    expect((cb.onSessionCreated!.mock.calls[0] as any[])[0]).toEqual(session);
    handle.close();
  });

  test("routes session_destroyed to onSessionDestroyed", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({ type: "session_destroyed", sessionId: "s1" });

    expect(cb.onSessionDestroyed).toHaveBeenCalledTimes(1);
    expect((cb.onSessionDestroyed!.mock.calls[0] as any[])[0]).toBe("s1");
    handle.close();
  });

  test("routes session_error to onSessionError", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({ type: "session_error", sessionId: "s1", error: "pi crashed" });

    expect(cb.onSessionError).toHaveBeenCalledTimes(1);
    expect((cb.onSessionError!.mock.calls[0] as any[])[0]).toBe("s1");
    expect((cb.onSessionError!.mock.calls[0] as any[])[1]).toBe("pi crashed");
    handle.close();
  });

  test("routes sessions_list to onSessionsList", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const sessions = [{ id: "s1", cwd: "/tmp", projectId: "p1", model: "m", state: "idle" as const }];
    ws.simulateMessage({ type: "sessions_list", sessions });

    expect(cb.onSessionsList).toHaveBeenCalledTimes(1);
    expect((cb.onSessionsList!.mock.calls[0] as any[])[0]).toEqual(sessions);
    handle.close();
  });

  test("routes pi_event to onPiEvent", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const event = { type: "agent_start" };
    ws.simulateMessage({ type: "pi_event", sessionId: "s1", event });

    expect(cb.onPiEvent).toHaveBeenCalledTimes(1);
    expect((cb.onPiEvent!.mock.calls[0] as any[])[0]).toBe("s1");
    expect((cb.onPiEvent!.mock.calls[0] as any[])[1]).toEqual(event);
    handle.close();
  });

  test("routes pi_response to onPiResponse", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const response = { type: "response", command: "get_state", success: true, data: {} };
    ws.simulateMessage({ type: "pi_response", sessionId: "s1", response });

    expect(cb.onPiResponse).toHaveBeenCalledTimes(1);
    expect((cb.onPiResponse!.mock.calls[0] as any[])[0]).toBe("s1");
    handle.close();
  });

  test("routes extension_ui_request to onExtensionUIRequest", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const request = { type: "extension_ui_request", id: "ext-1", method: "confirm", title: "Allow?", message: "ok?" };
    ws.simulateMessage({ type: "extension_ui_request", sessionId: "s1", request });

    expect(cb.onExtensionUIRequest).toHaveBeenCalledTimes(1);
    expect((cb.onExtensionUIRequest!.mock.calls[0] as any[])[0]).toBe("s1");
    handle.close();
  });

  test("send writes JSON to websocket", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    handle.send({ type: "sessions_list_request" });

    expect(ws.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse((ws.send.mock.calls[0] as any[])[0]);
    expect(sent.type).toBe("sessions_list_request");
    handle.close();
  });

  test("send is a no-op when not connected", () => {
    const cb = makeCallbacks();
    const handle = connectWS(cb);
    const ws = MockWebSocket.instances[0];

    handle.send({ type: "sessions_list_request" });
    expect(ws.send).toHaveBeenCalledTimes(0);
    handle.close();
  });
});
