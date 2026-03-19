import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { connectWS, type WSCallbacks } from "./ws";

type WSHandler = ((event: any) => void) | null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

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
  } satisfies WSCallbacks;
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
});
